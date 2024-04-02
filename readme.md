# Hallucigenia

![](https://github.com/voitaraujo/hallucigenia/assets/36885540/ee48c7d2-34e5-4b51-8d50-3e86910d9b1c)

### Sections

- [Purpose](#purpose)
- [Dependencies](#dependencies)
- [Installation](#installation)
- [Usage](#usage)
- [Developing](#developing)
- [Motivation](#motivation)
- [Limitations](#limitations)
- [TODO's](#todo)

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

_WIP_

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

## TODO

[ ] Encrypt data on .conf files<br>
[ ] Make the "watching" feature a independent process<br>
[ ] Fix grammar<br>
