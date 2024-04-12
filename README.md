# Hallucigenia

![](https://github.com/voitaraujo/hallucigenia/assets/36885540/ee48c7d2-34e5-4b51-8d50-3e86910d9b1c)

### Sections

* [Purpose](#purpose)
* [Dependencies](#dependencies)
* [Installation](#installation)
* [Usage](#usage)
  * [Setting up repositories](#setting-up-new-repository)
  * [Branches & Side Effects](#observing-branches-and-writing-side-effects)
  * [Watcher](#watcher)
  * [Checking and deleting connection](#checking-and-deleting-connection)
* [Developing](#developing)
* [Motivation](#motivation)
* [Limitations](#limitations)
* [TODO's](#todo)

## Purpose

- Register your BitBucket `repositories`; <br>
- Mark `branches` to be observed; <br>
- Clone on detecting `changes`; <br>
- Run `side effects` locally over them; <br>

## Dependencies

- [git](https://git-scm.com/)

## Installation

install the CLI globally using your preferred package manager.

```
npm install -g hallucigenia
```

## Usage

First of all, type `hallucigenia` on your terminal to run the CLI.

### Setting up new repository

Follow the steps on the video bellow to set up a new remote connection with Bitbucket repository.

[![](https://img.youtube.com/vi/i8q2gzHHSrY/maxresdefault.jpg)](https://youtu.be/i8q2gzHHSrY)

> NOTE: The repository access token only needs the "read" permission on repository level.

### Observing branches and writing side effects

Follow the steps on the video bellow to mark the branches on certain repositories to be observed and how to write side effects to run when they get updated.

[![](https://img.youtube.com/vi/xBoq6ecEXPk/maxresdefault.jpg)](https://youtu.be/xBoq6ecEXPk)

Make sure to read the instructions shown when you are about to write a new side effect, they are important!

> NOTE: the text editor opened to write the side effects is the default of your system.

### Watcher

The following video shows how to run the watcher mode and the result of a side effect

[![](https://img.youtube.com/vi/UHEHib-RvPo/maxresdefault.jpg)](https://youtu.be/UHEHib-RvPo)

The watcher mode will look for changes on observed branches of all repositories which may result on multiple calls to the Bitbucket API, for that reason we have a fixed cool down of 1 minute between checks so you don't DDoS them.

Note that we use the `$UPDATED_BRANCH_PATH` environment variable on the side effect script to know where the **cloned branch** is located and move it.

### Checking and deleting connection

If you have problems watching a branch or updating the branch list of a repository, your access token might have been revoked, in that case you can check the connection with the repository as shown on the following video and delete the connection before setting it up again.

[![](https://img.youtube.com/vi/JMQp2HuSi68/maxresdefault.jpg)](https://youtu.be/JMQp2HuSi68)

> NOTE: **soon** will be possible to edit the connection details!

## Developing

After cloning the repository, open the folder on your terminal and install the dependencies using your preferred package manager.

```
npm install
```

Build _all the .ts files_ to a _single hallucigenia_d.js_ on the **/dist** folder and execute it with the `dev` command.

```
npm run dev
```

<br>

> Alternatively, you could run `build:esbuild` and **link** the project to make the _"hallucigenia"_ command available on your terminal, but if you already have the package installed globally it may confuse your package manager(dunno, didn't tried tbh ¯\\\_(ツ)\_/¯).

<br>

```
// not recommended

npm run build:esbuild

npm --global link

hallucigenia
```

## Motivation

This CLI was intended to be only used internally by a client, which needed a simple way to deploy and test(locally) whenever some branches from his bitbucket repository got updated. Since I saw some people looking for something similar while doing my research, I decided to make it public.

## Limitations

_WIP_

## TODO's

[ ] Encrypt data on .conf files<br>
[ ] Make the "watching" feature an independent process<br>
[ ] Replace axios by fetch API<br>
