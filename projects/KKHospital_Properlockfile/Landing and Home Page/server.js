import express from "express";
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs";
import bcrypt from "bcrypt";
import lockfile from "proper-lockfile";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 3030;
const DB_PATH = path.join(__dirname, "..", "/shared-db/db.json");

console.log(DB_PATH);


// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json()); // <-- add this
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "css")));
app.use(express.static(path.join(__dirname, "images")));

//===Proper-Lockfile stuff===
//Function to check if theres a stale lock and removes it
function tryRecoverStaleLock() {
  try {
    // checkSync returns true if there is a lock AND it is not stale 
    const lockIsValid = lockfile.checkSync(DB_PATH, { stale: 30000 });

    if (!lockIsValid) {
      // lock is stale
      console.warn("[startup] Lock is absent or stale — attempting unlock if any.");
      try {
        lockfile.unlockSync(DB_PATH);
        console.log("[startup] UnlockSync succeeded (removed stale or leftover lock).");
      } catch (unlockErr) {
        // Could be that there was no lock at all or unlock fails — log and continue
        console.warn("[startup] unlockSync failed (maybe no lock existed):");
      }
    } else {
      console.log("[startup] Lock is valid — do not touch.");
    }
  } catch (err) {
    console.warn("[startup] Lock checkSync error — attempting unlock anyway:");
    try {
      lockfile.unlockSync(DB_PATH);
      console.log("[startup] UnlockSync succeeded after error.");
    } catch (unlockErr) {
      console.error("[startup] UnlockSync failed:");
    }
  }
}

// Locking logic. Takes in the CRUD operation functions
async function safeUpdate(updater) {
  const release = await lockfile.lock(DB_PATH, {
    stale: 30000,
    retries: { retries: 5, factor: 1.5, minTimeout: 500 },
    update: 15000,
  });

  console.log("Lock acquired.");
  try {
    await db.read();
    await updater(db.data);
    await db.write();
    
  } finally {
    try {
      await release();
    } catch (err) {
      console.error("Error releasing lock:", err);
    }
  }
}

// Initialize LowDB
// const file = join(__dirname, 'db.json');
tryRecoverStaleLock();
const file = join(__dirname, '../shared-db/db.json');
const adapter = new JSONFile(file);
const defaultData = { activeUser: null, users: [], lastActivity: null };
const db = new Low(adapter, defaultData);
await db.read();
db.data ||= defaultData;
await db.write();

// Max idle time
const maxIdleTime = 5 * 60 * 1000; // 5 min

// Middleware: check authentication
async function checkAuth(req, res, next) {
    const username = req.cookies.username; //Uses cookies to read the username
    if (!username) return res.redirect("/login.html");

    await db.read();
    // if (db.data.activeUser === username) {
    //     const lastActivity = db.data.lastActivity || 0;

    //     if (Date.now() - lastActivity > maxIdleTime) {
    //         // Idle logout
    //         db.data.activeUser = null;
    //         db.data.lastActivity = null;
    //         await db.write();

    //         res.clearCookie("username");
    //         res.clearCookie("lastActivity");

    //         return res.redirect("/login.html?loggedOut=idle");
    //     }

    //     db.data.lastActivity = Date.now();
    //     await db.write();
    //     res.cookie("lastActivity", Date.now().toString());
        return next();
    // }

    // return res.redirect("/login.html");
}

// Serve login page
app.get("/", (req, res) => res.redirect("/login.html"));

app.get("/login.html", async (req, res) => {
    const username = req.cookies.username;
    await db.read();
    res.sendFile(join(__dirname, "pages/login.html"));
});

// Login POST
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        await db.read();
        const user = db.data.users.find(u => u.username === username);
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            let page = fs.readFileSync(join(__dirname, "pages/login.html"), "utf-8");
            page = page.replace('{{message}}', 'Invalid username or password.');
            page = page.replace('style="display: none;"', 'style="display: block;"');
            return res.send(page);
        }

        // Use safeUpdate to acquire lock and update activeUser
        await safeUpdate(data => {
            data.activeUser = username;
            data.lastActivity = Date.now();
        });

        res.cookie("username", username);
        res.cookie("lastActivity", Date.now().toString());
        return res.redirect("/index.html");
    } catch (err) {
        console.error("Login error:", err);
        let page = fs.readFileSync(join(__dirname, "pages/login.html"), "utf-8");
        page = page.replace('{{message}}', 'Server error. Please try again.');
        page = page.replace('style="display: none;"', 'style="display: block;"');
        return res.send(page);
    }
});

// Protected index page
app.get("/index.html", checkAuth, (req, res) => {
    res.sendFile(join(__dirname, "pages/index.html"));
});

// Logout
// Logout
app.get("/logout", async (req, res) => {
    const username = req.cookies.username;
    await db.read();
    // if (db.data.activeUser === username) {
    //     db.data.activeUser = null;
    //     db.data.lastActivity = null;
    //     await db.write();
    // }

    res.clearCookie("username");
    res.clearCookie("lastActivity");

    // Respect type query parameter: 'manual' or 'idle'
    const type = req.query.type || "manual";
    return res.redirect(`/login.html?loggedOut=${type}`);
});


// Status endpoint
app.get("/status", async (req, res) => {
    await db.read();
    const currentUser = req.cookies.username || null;
    const userObj = db.data.users.find(u => u.username === currentUser);
    const role = userObj ? userObj.role : null;

    res.json({
        activeUser: db.data.activeUser,
        currentUser,
        role
    });
});

// Create new user
app.post("/create-user", async (req, res) => {
    try {
        const currentUser = req.cookies.username;
        await db.read();

        const userObj = db.data.users.find(u => u.username === currentUser);
        if (!userObj || userObj.role !== "Administrator") {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const { username, password, role } = req.body;

        if (!username || !password || !role) {
            return res.status(400).json({ success: false, message: "Missing fields" });
        }

        // Check if user exists before acquiring lock
        if (db.data.users.find(u => u.username === username)) {
            return res.status(400).json({ success: false, message: "Username exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Use safeUpdate to acquire lock and add user
        await safeUpdate(data => {
            // Double-check user doesn't exist (in case of race condition)
            if (!data.users.find(u => u.username === username)) {
                data.users.push({ username, password: hashedPassword, role });
            }
        });

        return res.json({ success: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

// View all users (Admin only)
app.get("/users", async (req, res) => {
    const currentUser = req.cookies.username;
    await db.read();

    const userObj = db.data.users.find(u => u.username === currentUser);
    if (!userObj || userObj.role !== "Administrator") {
        return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // Return all users without their passwords
    const users = db.data.users.map(u => ({
        username: u.username,
        role: u.role
    }));

    return res.json({ success: true, users });
});

// Update user role
app.post("/update-user", async (req, res) => {
    try {
        const { username, role } = req.body;

        if (!username || !role) {
            return res.status(400).json({ success: false, message: "Missing fields" });
        }

        // Use safeUpdate to acquire lock and update user role
        await safeUpdate(data => {
            const userToUpdate = data.users.find(u => u.username === username);
            if (!userToUpdate) {
                throw new Error("User not found");
            }
            userToUpdate.role = role;
        });

        res.json({ success: true });
    } catch (err) {
        console.error("Update user error:", err);
        if (err.message === "User not found") {
            res.status(404).json({ success: false, message: "User not found" });
        } else {
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
});

// Delete user
app.post("/delete-user", async (req, res) => {
    try {
        const { username } = req.body;
        await db.read();

        const index = db.data.users.findIndex(u => u.username === username);
        if (index === -1) {
            return res.json({ success: false, message: "User not found" });
        }

        // Use safeUpdate to acquire lock and delete user
        await safeUpdate(data => {
            const userIndex = data.users.findIndex(u => u.username === username);
            if (userIndex !== -1) {
                data.users.splice(userIndex, 1);
            }
        });

        res.json({ success: true });
    } catch (err) {
        console.error("Delete user error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});






app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
