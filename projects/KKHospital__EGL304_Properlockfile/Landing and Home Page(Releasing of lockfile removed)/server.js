import express from "express";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs";
import bcrypt from "bcrypt";
import multer from "multer";
import lockfile from "proper-lockfile";


const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 3000;
const DB_PATH = path.join(__dirname, "..", "/shared-db/db.json");

//===Proper-Lockfile stuff===
//Function to check if theres a stale lock and removes it
function tryRecoverStaleLock() {
  try {
    // checkSync returns true if there is a lock AND it is not stale
    const lockIsValid = lockfile.checkSync(DB_PATH, { stale: 30000 });

    if (!lockIsValid) {
      // lock is stale
      console.warn(
        "[startup] Lock is absent or stale — attempting unlock if any."
      );
      try {
        lockfile.unlockSync(DB_PATH);
        console.log(
          "[startup] UnlockSync succeeded (removed stale or leftover lock)."
        );
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
  let didUpdate = false;
  let release;
  try {
    release = await lockfile.lock(DB_PATH, {
      stale: 30000,
      retries: { retries: 5, factor: 1.5, minTimeout: 500 },
      update: 15000,
    });
    console.log("Lock acquired.");
    await db.read();
    didUpdate = await updater(db.data);
    if (didUpdate) {
      await db.write();
    }
  } catch (err) {
    console.error("safeUpdate error:", err);
  } finally {
    if (release) {
      try {
        null;
      } catch (err) {
        console.error("Error releasing lock:", err);
      }
    }
  }
  return didUpdate;
}
tryRecoverStaleLock();
//===========================

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "css")));
app.use(express.static(path.join(__dirname, "images")));

// Initialize DB
const file = join(__dirname, "../shared-db/db.json");
const adapter = new JSONFile(file);
const defaultData = {
  activeUser: null,
  users: [],
  roles: ["Administrator", "User"],
  lastActivity: null,
  activityLog: [],
};

const db = new Low(adapter, defaultData);
await db.read();
db.data ||= defaultData;
await db.write();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// Max idle time (30 min)
// const maxIdleTime = 30 * 60 * 1000;

async function checkAuth(req, res, next) {
  const username = req.cookies.user4000;

  if (!username) return res.redirect("/login.html");

  await db.read();

  // if (db.data.activeUser === username) {
  //     const lastActivity = db.data.lastActivity || 0;

  //     // Idle timeout check
  //     if (Date.now() - lastActivity > maxIdleTime) {
  //         db.data.activeUser = null;
  //         db.data.lastActivity = null;
  //         await db.write();

  //         res.clearCookie("user3030");
  //         res.clearCookie("lastActivity");

  //         return res.redirect("/login.html?loggedOut=idle");
  //     }

  //     // Update activity
  //     db.data.lastActivity = Date.now();
  //     await db.write();
  //     res.cookie("lastActivity", Date.now().toString());

  return next();
  // }

  // return res.redirect("/login.html");
}

// log activity
async function logActivity(user, action, details = "") {
  await db.read();
  db.data.activityLog ||= [];
  db.data.activityLog.push({
    timestamp: Date.now(),
    user,
    action,
    details,
  });
  await db.write();
}

// -------------------------------------------------
// Serve login page
// -------------------------------------------------
app.get("/", (req, res) => res.redirect("/login.html"));

app.get("/login.html", async (req, res) => {
  res.sendFile(join(__dirname, "pages/login.html"));
});

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  await db.read();

  // // If someone else is active
  // if (db.data.activeUser && db.data.activeUser !== username) {
  //     const idleTime = Date.now() - (db.data.lastActivity || 0);

  //     if (idleTime <= maxIdleTime) {
  //         let page = fs.readFileSync(join(__dirname, "pages/login.html"), "utf-8");
  //         page = page.replace('{{message}}', `System is currently used by ${db.data.activeUser}. Actions disabled.`);
  //         page = page.replace('style="display: none;"', 'style="display: block;"');
  //         return res.send(page);
  //     } else {
  //         // Auto clear idle user
  //         db.data.activeUser = null;
  //         db.data.lastActivity = null;
  //         await db.write();
  //     }
  // }

  const user = db.data.users.find((u) => u.username === username);

  if (
    user &&
    user.status == "active" &&
    (await bcrypt.compare(password, user.password))
  ) {
    await safeUpdate((data) => {
      data.activeUser = username;
      data.lastActivity = Date.now();
    });

    // FIXED cookie name
    res.cookie("user4000", username);
    res.cookie("lastActivity", Date.now().toString());

    return res.redirect("/index.html");
  }

  // Invalid login
  let page = fs.readFileSync(join(__dirname, "pages/login.html"), "utf-8");
  page = page.replace("{{message}}", "Invalid username or password.");
  page = page.replace('style="display: none;"', 'style="display: block;"');
  return res.send(page);
});

// -------------------------------------------------
// Protected page
// -------------------------------------------------
app.get("/index.html", checkAuth, (req, res) => {
  res.sendFile(join(__dirname, "pages/index.html"));
});

//Logout
app.get("/logout", async (req, res) => {
  const username = req.cookies.user4000;

  await db.read();

  // if (db.data.activeUser === username) {
  //     db.data.activeUser = null;
  //     db.data.lastActivity = null;
  //     await db.write();
  // }

  res.clearCookie("user4000");
  res.clearCookie("lastActivity");

  const type = req.query.type || "manual";
  return res.redirect(`/login.html?loggedOut=${type}`);
});

// app.get("/current-user", async (req, res) => {
//     await db.read();
//     res.json({
//         activeUser: db.data.activeUser,
//         lastActivity: db.data.lastActivity
//     });
// });

// app.post("/request-logout", async (req, res) => {
//     await db.read();

//     db.data.activeUser = null;
//     db.data.lastActivity = null;

//     await db.write();

//     res.json({ success: true, message: "Active user has been logged off." });
// });

// To View Status
app.get("/status", async (req, res) => {
  await db.read();

  const currentUser = req.cookies.user4000 || null;
  const userObj = db.data.users.find((u) => u.username === currentUser);
  const role = userObj ? userObj.role : null;

  res.json({
    activeUser: db.data.activeUser,
    currentUser,
    role,
    allUsers: db.data.users.map((u) => ({
      username: u.username,
      role: u.role,
    })),
  });
});

app.post("/create-user", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const createdBy = req.cookies.user4000 || "Public";

    await db.read();

    if (!username || !password || !role) {
      return res.json({ success: false, message: "Missing fields" });
    }

    if (db.data.users.find((u) => u.username === username)) {
      return res.json({ success: false, message: "Username already exists" });
    }

    const creator = db.data.users.find((u) => u.username === createdBy);

    // ⭐ CORE LOGIC
    const status =
      creator && creator.role === "Administrator"
        ? "active" // auto approve
        : "pending"; // needs admin approval

    const hashed = await bcrypt.hash(password, 10);

    // Use safeUpdate to acquire lock and add user
    const userCreated = await safeUpdate((data) => {
      if (!data.users.find((u) => u.username === username)) {
        data.users.push({
          username,
          password: hashed,
          role,
          status,
          createdBy,
        });
        return true;
      }
      return false;
    });

    if (userCreated) {
      await logActivity(
        createdBy,
        status === "active" ? "Created user" : "Account requested",
        `Username: ${username}, Role: ${role}`
      );
      return res.json({
        success: true,
        message:
          status === "active"
            ? "User created successfully."
            : "Account request submitted. Awaiting admin approval.",
      });
    } else {
      return res.json({
        success: false,
        message: "User could not be created. Please try again later or check for database lock.",
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// -------------------------------------------------
// View All users : For account with Admin Role
// -------------------------------------------------
app.get("/users", async (req, res) => {
  const currentUser = req.cookies.user4000;
  await db.read();

  const userObj = db.data.users.find((u) => u.username === currentUser);
  if (!userObj || userObj.role !== "Administrator") {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }

  const users = db.data.users.map((u) => ({
    username: u.username,
    role: u.role,
    status: u.status,
  }));

  return res.json({ success: true, users });
});

// -------------------------------------------------
// Update User Role : For account with Admin Role
// -------------------------------------------------
// Update user role
app.post("/update-user", async (req, res) => {
  const currentUser = req.cookies.user4000;
  await db.read();
  const { username, role, password } = req.body;

  if (!username || !role) {
    return res.json({ success: false, message: "Missing fields" });
  }

  // Use safeUpdate to acquire lock and update user role
  const userUpdated = await safeUpdate(async (data) => {
    const user = data.users.find((u) => u.username === username);
    if (!user) {
      return false;
    }
    user.role = role;
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }
    return true;
  });
  if (userUpdated) {
    await logActivity(
      currentUser,
      "Updated user",
      `Username: ${username}, New role: ${role}${
        password ? ", password changed" : ""
      }`
    );
    return res.json({ success: true, message: "User updated" });
  } else {
    return res.json({ success: false, message: "User not found" });
  }
});

// -------------------------------------------------
// Delete User : For account with Admin Role
// -------------------------------------------------
app.post("/delete-user", async (req, res) => {
  const currentUser = req.cookies.user4000;
  const { username } = req.body;

  await db.read();

  const index = db.data.users.findIndex((u) => u.username === username);

  if (index === -1)
    return res.json({ success: false, message: "User not found" });

  // Use safeUpdate to acquire lock and delete user
  const userDeleted = await safeUpdate((data) => {
    const userIndex = data.users.findIndex((u) => u.username === username);
    if (userIndex !== -1) {
      data.users.splice(userIndex, 1);
      return true;
    }
    return false;
  });
  if (userDeleted) {
    await logActivity(currentUser, "Deleted user", `Username: ${username}`);
    return res.json({ success: true, message: "User deleted" });
  } else {
    return res.json({ success: false, message: "User not found" });
  }
});

// To View User Requests
app.get("/user-requests", async (req, res) => {
  const currentUser = req.cookies.user4000;
  await db.read();

  const admin = db.data.users.find((u) => u.username === currentUser);
  if (!admin || admin.role !== "Administrator") {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }

  const requests = db.data.users
    .filter((u) => u.status === "pending")
    .map((u) => ({
      username: u.username,
      role: u.role,
      createdBy: u.createdBy,
    }));

  return res.json({ success: true, requests });
});

// To approve user
app.post("/approve-user", async (req, res) => {
  const adminUser = req.cookies.user4000;
  const { username } = req.body;

  await db.read();

  const admin = db.data.users.find((u) => u.username === adminUser);
  if (!admin || admin.role !== "Administrator") {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }

  const userApproved = await safeUpdate((data) => {
    const user = data.users.find((u) => u.username === username);
    if (!user) {
      return false;
    }
    user.status = "active";
    return true;
  });
  if (userApproved) {
    await logActivity(adminUser, "Approved user", `Username: ${username}`);
    res.json({ success: true, message: "User approved" });
  } else {
    res.status(404).json({ success: false, message: "User not found" });
  }
});

// To Reject User
app.post("/reject-user", async (req, res) => {
  const { username } = req.body;
  const adminUser = req.cookies.user4000;
  await db.read();

  const userRejected = await safeUpdate((data) => {
    const index = data.users.findIndex((u) => u.username === username);
    if (index === -1) {
      return false;
    }
    data.users.splice(index, 1);
    return true;
  });
  if (userRejected) {
    await logActivity(adminUser, "Rejected user", `Username: ${username}`);
    res.json({ success: true, message: "User rejected" });
  } else {
    res.status(404).json({ success: false, message: "User not found" });
  }
});

// To Create Roles
app.post("/create-role", async (req, res) => {
  const currentUser = req.cookies.user4000;
  const { role } = req.body;

  await db.read();

  const admin = db.data.users.find((u) => u.username === currentUser);
  if (!admin || admin.role !== "Administrator") {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }

  if (!role) {
    return res.json({ success: false, message: "Role name required" });
  }

  const roleCreated = await safeUpdate((data) => {
    data.roles ||= [];
    if (data.roles.includes(role)) {
      return false;
    }
    data.roles.push(role);
    return true;
  });
  if (roleCreated) {
    await logActivity(currentUser, "Created role", role);
    res.json({ success: true, message: "Role created" });
  } else {
    res.json({ success: false, message: "Role already exists" });
  }
});

// get roles
app.get("/roles", async (req, res) => {
  await db.read();
  res.json({ roles: db.data.roles });
});

// Update role
app.post("/update-role", async (req, res) => {
  const currentUser = req.cookies.user4000;
  const { oldRole, newRole } = req.body;

  await db.read();
  // Admin check
  const admin = db.data.users.find((u) => u.username === currentUser);
  if (!admin || admin.role !== "Administrator") {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }
  if (!oldRole || !newRole) {
    return res.json({ success: false, message: "Missing fields" });
  }
  const roleUpdated = await safeUpdate((data) => {
    if (!data.roles.includes(oldRole)) {
      return false;
    }
    if (data.roles.includes(newRole)) {
      return false;
    }
    data.roles = data.roles.map((r) => (r === oldRole ? newRole : r));
    data.users.forEach((u) => {
      if (u.role === oldRole) {
        u.role = newRole;
      }
    });
    return true;
  });
  if (roleUpdated) {
    await logActivity(currentUser, "Updated role", `${oldRole} → ${newRole}`);
    res.json({ success: true, message: "Role updated" });
  } else {
    res.json({
      success: false,
      message: "Role update failed (role not found or already exists)",
    });
  }
});

app.post("/delete-role", async (req, res) => {
  const currentUser = req.cookies.user4000;
  const { role } = req.body;

  await db.read();
  const admin = db.data.users.find((u) => u.username === currentUser);
  if (!admin || admin.role !== "Administrator") {
    return res.status(403).json({ success: false });
  }
  if (["Administrator", "User"].includes(role)) {
    return res.json({
      success: false,
      message: "Default roles cannot be deleted",
    });
  }
  const roleDeleted = await safeUpdate((data) => {
    if (data.users.some((u) => u.role === role)) {
      return false;
    }
    if (!data.roles.includes(role)) {
      return false;
    }
    data.roles = data.roles.filter((r) => r !== role);
    return true;
  });
  if (roleDeleted) {
    await logActivity(currentUser, "Deleted role", role);
    res.json({ success: true, message: "Role deleted" });
  } else {
    res.json({
      success: false,
      message: "Role is assigned to users or not found",
    });
  }
});

// add patient
app.post("/create-patient", async (req, res) => {
  const currentUser = req.cookies.user4000;
  await db.read();
  const userObj = db.data.users.find((u) => u.username === currentUser);
  if (!userObj || userObj.role !== "Administrator") {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }
  const { name, contactNumber, medicalHistory, ward } = req.body;
  if (!name || !contactNumber || !medicalHistory || !ward) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }
  let newId;
  const patientCreated = await safeUpdate((data) => {
    data.patients ||= [];
    const lastPatient = data.patients[data.patients.length - 1];
    newId = lastPatient ? lastPatient.id + 1 : 1;
    data.patients.push({
      id: newId,
      name,
      contactNumber,
      medicalHistory,
      ward,
    });
    return true;
  });
  if (patientCreated) {
    await logActivity(
      currentUser,
      "Added patient",
      `Patient ID ${newId} - ${name}, Ward ${ward}`
    );
    res.json({ success: true, patientId: newId });
  } else {
    res.json({ success: false, message: "Patient creation failed" });
  }
});

// get patients
app.get("/patients", async (req, res) => {
  const currentUser = req.cookies.user4000;
  await db.read();
  const userObj = db.data.users.find((u) => u.username === currentUser);
  if (!userObj || userObj.role !== "Administrator") {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }
  res.json({ success: true, patients: db.data.patients });
});

// delete patient
app.delete("/patients/:id", async (req, res) => {
  const currentUser = req.cookies.user4000;
  const id = Number(req.params.id);
  await db.read();
  const patientDeleted = await safeUpdate((data) => {
    const index = data.patients.findIndex((p) => p.id === id);
    if (index === -1) return false;
    data.patients.splice(index, 1);
    return true;
  });
  if (patientDeleted) {
    await logActivity(currentUser, "Deleted patient", `Patient ID ${id}`);
    res.json({ success: true, message: "Patient deleted" });
  } else {
    res.json({ success: false, message: "Patient not found" });
  }
});

// work schedule
app.get("/work-schedule", async (req, res) => {
  const currentUser = req.cookies.user4000;
  await db.read();

  const userObj = db.data.users.find((u) => u.username === currentUser);
  if (!userObj) {
    return res.status(401).json({ success: false });
  }

  const data = db.data.patients.map((p) => ({
    id: p.id,
    name: p.name,
    ward: p.ward,
  }));

  res.json({ success: true, schedule: data });
});

// display activity log
app.get("/activity-log", async (req, res) => {
  const currentUser = req.cookies.user4000;
  await db.read();

  const userObj = db.data.users.find((u) => u.username === currentUser);
  if (!userObj || userObj.role !== "Administrator") {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }

  const logs = db.data.activityLog.map((a) => ({
    timestamp: a.timestamp,
    user: a.user,
    action: a.action,
    details: a.details,
  }));

  return res.json({ success: true, logs });
});

app.post("/upload-file", upload.single("file"), async (req, res) => {
  try {
    await db.read();
    const { title, desc } = req.body;
    const currentUser = req.cookies.user4000;
    if (!req.file || !title) {
      return res.json({ success: false, message: "Missing file or title" });
    }
    const newFile = {
      id: Date.now().toString(),
      title,
      desc,
      filename: req.file.filename,
      uploader: currentUser,
      date: Date.now(),
    };
    const fileAdded = await safeUpdate((data) => {
      if (!Array.isArray(data.files)) {
        data.files = [];
      }
      data.files.push(newFile);
      return true;
    });
    if (fileAdded) {
      res.json({ success: true, fileId: newFile.id });
    } else {
      res.json({ success: false, message: "File upload failed" });
    }
  } catch (err) {
    console.error("Upload error:", err);
    res.json({ success: false, message: "Upload failed" });
  }
});

app.get("/files", async (req, res) => {
  await db.read();
  res.json({ files: db.data.files });
});

app.get("/recent-files", async (req, res) => {
  await db.read();
  const recent = [...db.data.files].sort((a, b) => b.date - a.date).slice(0, 5);

  res.json({ files: recent });
});

app.get("/download-file/:id", async (req, res) => {
  await db.read();

  const file = db.data.files.find((f) => f.id === req.params.id);
  if (!file) return res.sendStatus(404);

  res.download(path.join("uploads", file.filename));
});

app.post("/delete-file", async (req, res) => {
  await db.read();
  const { id } = req.body;
  let fileDeleted = false;
  let filenameToDelete = null;
  fileDeleted = await safeUpdate((data) => {
    const index = data.files?.findIndex((f) => f.id === id);
    if (index === undefined || index === -1) {
      return false;
    }
    filenameToDelete = data.files[index].filename;
    data.files.splice(index, 1);
    return true;
  });
  if (fileDeleted && filenameToDelete) {
    try {
      fs.unlinkSync(path.join("uploads", filenameToDelete));
    } catch (err) {
      console.error("File delete error:", err);
    }
    res.json({ success: true, message: "File deleted" });
  } else {
    res.json({ success: false, message: "File not found" });
  }
});

// -------------------------------------------------
// Start server
// -------------------------------------------------
app.listen(port, () =>
  console.log(`Server running at http://localhost:${port}`)
);
