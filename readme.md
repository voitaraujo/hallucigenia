# Hallucigenia

![](https://github.com/voitaraujo/hallucigenia/assets/36885540/ee48c7d2-34e5-4b51-8d50-3e86910d9b1c)

## What you can do

- Register your BitBucket `repositories`; <br>
- Mark `branches` to be observed; <br>
- Run `side effects`(terminal scripts) locally when any of them are updated; <br>

### Usage
_WIP_

### Dependencies

- [git](https://git-scm.com/)

## Developing

### Dependencies

- [esbuild](https://github.com/evanw/esbuild) and/or [ncc](https://github.com/vercel/ncc)<br><br>

Clone the project and install the dependencies with your preferred package manager

```
pnpm install
```

Build _all the .ts files_ to a _single .js_ on the **/dist** folder(you can add the `--watch` flag at the end of the `build:esbuild` command on the `package.json` to make esbuild watch for code changes)

```
pnpm build:esbuild
```

Link the content of the _/dist_ to make the _"hallucigenia"_ command available on your terminal(you'll have to be at the root of the project for this to work!)

```
pnpm --global link
```

Also **if you are on OSX**, you may need to run this command to make the .js executable

```
chmod +x ./dist/hallucigenia.js
```

Finally, just call **`hallucigenia`** on your terminal to see the app running.


https://github.com/voitaraujo/hallucigenia/assets/36885540/50bcca81-f2ec-4083-ba3b-b2d3f4c4bf47



### TODO

[ ] Encrypt data on .conf files<br>
[ ] Make the "watching" feature a independent process<br>
[ ] Fix grammar<br>
[ ] publish to npm

<!-- [REEVALUATING] Use chokidar to monitor & update the app state when any file inside "repositories" change<br> -->
