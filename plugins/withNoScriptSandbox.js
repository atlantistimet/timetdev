// Xcode 15+ sandboxes build scripts; the React Native "Bundle" phase then
// fails with "Operation not permitted" when it writes ip.txt into the app.
// Turn the sandbox off for every build configuration.
const { withXcodeProject } = require('expo/config-plugins');

module.exports = function withNoScriptSandbox(config) {
  return withXcodeProject(config, (cfg) => {
    const sections = cfg.modResults.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(sections)) {
      const entry = sections[key];
      if (entry && typeof entry === 'object' && entry.buildSettings) {
        entry.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
      }
    }
    return cfg;
  });
};
