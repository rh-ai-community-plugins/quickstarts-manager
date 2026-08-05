# Contributing

Thank you for your interest in the Quickstarts Manager community plugin for Red Hat OpenShift AI Dashboard.

## Branching Workflow

- **`main`** — Release branch. Always reflects the latest released version.
- **`dev`** — Development branch (default). All work happens here or in branches off `dev`.
- **Feature/fix branches** — Branch from `dev`, PR back to `dev`.
- **Releases** — When ready to release, PR from `dev` to `main`.

## How to Contribute

1. Fork the repository and create a feature or fix branch from `dev`.
2. Make your changes and ensure tests and lint pass:

   ```bash
   npm test
   npm run lint
   ```

3. Submit a pull request targeting the `dev` branch with a clear description of the change.

## Reporting Issues

Please use [GitHub Issues](https://github.com/rh-ai-community-plugins/quickstarts-manager/issues) to report bugs or suggest improvements.

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
