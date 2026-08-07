// Silence expected console output during tests.
//
// Many suites deliberately exercise error and edge-case branches (network
// failures, 404s, invalid registry entries, missing helm, etc.) whose code
// paths log via console.warn/console.error. No test asserts on console output,
// so we mute it to keep test runs readable. Spies are re-installed before every
// test so suites that call jest.resetAllMocks() stay silenced.
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'debug').mockImplementation(() => {});
});
