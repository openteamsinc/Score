# Annotate Requirements Action

This GitHub Action reads your `requirements.txt`, `pyproject.toml` or `package.json` files,  
fetches maturity and health data from the [opensourcescore.dev]([https://d.app](https://opensourcescore.dev/docs)), and annotates each package with recommendations.  
It provides feedback on whether adding or updating a package will improve stability and maintainability.


## Inputs

### `diff-only`

**Optional**: If set to `"true"`, the action will only annotate the lines that were modified in the pull request. If not set or `false`, the action will annotate all packages in the file. Default is `false`.

### `requirements-txt`

**Optional**: The path to the `requirements.txt`. Default is `requirements.txt`

### `pyproject-toml`

**Optional**: The path to the `pyproject.toml`. Default is `pyproject.toml`

### `package.json`

**Optional**: The path to the `package.json`. Default is `package.json`

## Example Usage

This example demonstrates how to configure the action to work with both `pip` and `conda` ecosystems and how to annotate only the modified lines in a pull request.

```yaml
name: Annotate Python Packages

on: [pull_request]

jobs:
  annotate-requirements:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: openteamsinc/score@v1.1
        with:
          diff-only: true

