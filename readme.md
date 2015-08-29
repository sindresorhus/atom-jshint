# JSHint

> Validate JavaScript with [JSHint](http://jshint.com)

![](https://cloud.githubusercontent.com/assets/170270/3834266/54ad6b1c-1daf-11e4-9c46-98e6e4abab07.png)


## Install

```
$ apm install jshint
```

Or Settings → Install → Search for `jshint` *(install `Jshint`, not `Atom Jshint`)*


## Features

- Validates in realtime.
- Line and line number turns red on error.
- Hover over the line number to see the errors.
- Displays the error from the current line or the first error in the statusbar; clicking the statusbar message moves the cursor to the error.
- Reads your `.jshintrc` config and `jshintConfig` in package.json using the same logic as JSHint.
- Option to only validate on save.
- Command `Jshint: Lint` to manually lint.
- Command `Jshint: Go To Error` to move the cursor to the error displayed in the statusbar.
- Supports [React JSX](http://facebook.github.io/react/docs/jsx-in-depth.html). *(must be enabled in Settings)*


## License

MIT © [Sindre Sorhus](http://sindresorhus.com)
