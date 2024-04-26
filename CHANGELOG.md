# Changelog

## 0.3.5 - 2024-04-26

### Added

- menu to change the remote connection details
- menu to change the remote connection alias

### Fixed

- contrast of the menu names
- disabling remote options of repository when connection status is "offline"
- repository connection status not updating when failing to sync branches
- bug when watching a repository that doesn't have connection anymore with Bitbucket, it would cause an infinite loop

### Changed

- naming of repository related menu names on types(they start with "repository:" now)
- pkg version number on package.json
- connections with Bitbucket now are done using fetch
- increased number of options on screen on list menus

### Removed

- a lot of ugly if statements
- axios
- zod
- zod validation schema from from app logic

## 0.3.4 - 2024-04-08

### Added

- descriptions to most of the options
- allow user to quick setup of new repository

### Fixed

- grammar on multiple files
- naming of functions and params

### Changed

- include /.vscode folder to .ignore files

## 0.3.3 - 2024-04-03

### Added

- .npmignore file
- CHANGELOG.md file
- added version to Hallucigenia shared view
- added latest-version to check latest version of Hallucigenia
- added menus.ts to project

### Fixed

- execution of .sh files on OSX(possibly on Linux as well).
- repository field on package.json

### Changed

- .gitignore file
- readme.md file name to upper case
- adjusted the author field on package.json

### Removed

- number os repositories found from Hallucigenia shared view
- removed /dist folder from git tracking
- removed menus from hallucigenia.ts entry file
