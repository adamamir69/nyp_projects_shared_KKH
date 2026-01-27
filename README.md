# nyp_projects
This workspace exists to reduce the number of total files that the 
Nanyang Polytechnic projects require to be hosted on the offline 
shared drive of KKH to mitigate the issues derived from the scenario 
and hardware. 

## Quick Startup
1. Make a copy of the your project and place it into the projects folder of nyp_projects
2. Open the file named package.json
3. Ensure that the project name is unique
4. Ensure that the dependencies in pacakge.json specify the version numbers
5. Delete the contents of the folder named node_modules
6. run ```npm install``` in the directory of nyp_projects

## Changing node module dependancy version

1. Go into package.json of the folder of your project and change the version number
2. Delete the contents of the node_modules folders and the package-lock.json files
3. run ```npm install``` in the directory of nyp_projects

## Manually setting a common node module version

1. Go into package.json of the nyp_projects directory and change the version number
2. Delete the contents of the node_modules folders and the package-lock.json files
3. run ```npm install``` in the directory of nyp_projects

## Directory structure
nyp_projects/<br>
├ -- node_modules/<br>
│ ├ -- example_node_module/<br>
│   ├ -- HISTORY.md<br>
│   ├ -- index.js<br>
│   ├ -- LICENSE<br>
│   ├ -- package.json<br>
│   ├ -- README.md<br>
├ -- projects/<br>
│   ├ -- example_project/<br>
│     ├ -- node_modules/<br>
│     ├ -- package.json<br>
│     ├ -- README.md<br>
├ -- package-lock.json<br>
├ -- package.json<br>
├ -- README.md<br>


## Limitations

- npm workspaces will only hoist a singular version of every node module into the directory
- npm workspaces will not automatically change the version in the directory regardless of how many projects use a different version
- The directory verison of a node module will be used unless the version is specified in your depdencies in your package.json for your project
- All folders within the nyp_projects folder must be named using URL-friendly characters exclusively, otherwise there will be an npm error

## More about certain things in npm that you might not know yet because you are a student and for some reason we are learning node, and by extension, npm in the same year as starting the project

### What is NPM?
npm is many things.
- npm is the open source project that is the package manager for Node.js that is currently maintained by npm, Inc under GitHub
- The package manager can install packages from the npm registry that exists to share modules of code
- These modules of code typically contain functions that are difficult and time consuming to create from scratch. Using these should reduce the amount of time it will take to complete your project.

### Dependency specification
- ~version “Approximately equivalent to version”, will automatically update you to all future patch versions that are backwards-compatible, without incrementing the minor version. ~1.2.3 will use releases from 1.2.3 to < 1.3.0. (Except for when it doesn’t)

- ^version “Compatible with version”, will automatically update you to all future minor/patch versions that are backwards-compatible, without incrementing the major version. ^1.2.3 will use releases from 1.2.3 to < 2.0.0. (Except for when it doesn’t)

For the most part, the caret(^) accepts more versions than the tilde(~).

### Conventions
It is advised to use kebab-case or snake_case when naming your files and folders for Node.js. 

The specifics of npm's package.json handling requires:

    The name must be less than or equal to 214 characters. This includes the scope for scoped packages.

    The names of scoped packages can begin with a dot or an underscore. This is not permitted without a scope.

    New packages must not have uppercase letters in the name.

    The name ends up being part of a URL, an argument on the command line, and a folder name. Therefore, the name can't contain any non-URL-safe characters.

    Don't use the same name as a core Node module.

    Don't put "js" or "node" in the name. It's assumed that it's js, since you're writing a package.json file, and you can specify the engine using the "engines" field. (See below.)

    The name will probably be passed as an argument to require(), so it should be something short, but also reasonably descriptive.

    You may want to check the npm registry to see if there's something by that name already, before you get too attached to it. https://www.npmjs.com/

## Troubleshooting

### npm error code EINVALIDPACKAGENAME
Ensure that the folder that was used for your project uses URL-friendly characters.
URL-friendly characters:
    A - Z
    a - z
    0 - 9
    Special characters, like $-_.+!*'(),

### npm error code EDUPLICATEWORKSPACE
Your project has a similar name that is specified in the package.json file to another project in the projects folder.
Ensure that the name in the package.json is unique.

### Project no longer functions after moving into nyp_projects
Ensure that the dependencies within the package.json of your project contains version number.





