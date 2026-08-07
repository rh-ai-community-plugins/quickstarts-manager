import {
  quickstartsManagerAreaExtension,
  communityPluginsSectionExtension,
  quickstartsManagerSectionExtension,
  quickstartsNavExtension,
  settingsNavExtension,
  quickstartsManagerRouteExtension,
  extensions,
} from '../extensions';

describe('RHOAI Plugin Extensions', () => {
  describe('quickstartsManagerAreaExtension', () => {
    it('should have the correct type and id', () => {
      expect(quickstartsManagerAreaExtension.type).toBe('app.area');
      expect(quickstartsManagerAreaExtension.properties.id).toBe('quickstarts-manager');
    });

    it('should have an empty featureFlags array', () => {
      expect(quickstartsManagerAreaExtension.properties.featureFlags).toEqual([]);
    });
  });

  describe('communityPluginsSectionExtension', () => {
    it('should define the community-plugins section', () => {
      expect(communityPluginsSectionExtension.type).toBe('app.navigation/section');
      expect(communityPluginsSectionExtension.properties.id).toBe('community-plugins');
      expect(communityPluginsSectionExtension.properties.title).toBe('Community plugins');
      expect(communityPluginsSectionExtension.properties.group).toBe('9_plugins');
    });

    it('should have an iconRef function', () => {
      expect(typeof communityPluginsSectionExtension.properties.iconRef).toBe('function');
    });
  });

  describe('quickstartsManagerSectionExtension', () => {
    it('should define a subsection nested under community-plugins', () => {
      expect(quickstartsManagerSectionExtension.type).toBe('app.navigation/section');
      expect(quickstartsManagerSectionExtension.properties.id).toBe('quickstarts-manager');
      expect(quickstartsManagerSectionExtension.properties.title).toBe('Quickstarts Manager');
      expect(quickstartsManagerSectionExtension.properties.group).toBe('1_quickstarts_manager');
      expect(quickstartsManagerSectionExtension.properties.section).toBe('community-plugins');
      expect(typeof quickstartsManagerSectionExtension.properties.iconRef).toBe('function');
    });
  });

  describe('navigation extensions', () => {
    it('should define Quickstarts nav item under quickstarts-manager section', () => {
      expect(quickstartsNavExtension.type).toBe('app.navigation/href');
      expect(quickstartsNavExtension.properties.id).toBe('quickstarts-manager-quickstarts');
      expect(quickstartsNavExtension.properties.title).toBe('Quickstarts');
      expect(quickstartsNavExtension.properties.href).toBe('/quickstarts-manager/quickstarts');
      expect(quickstartsNavExtension.properties.section).toBe('quickstarts-manager');
      expect(quickstartsNavExtension.properties.path).toBe('/quickstarts-manager/quickstarts/*');
    });
  });

  describe('route extension', () => {
    it('should define a single wildcard route with lazy component', () => {
      expect(quickstartsManagerRouteExtension.type).toBe('app.route');
      expect(quickstartsManagerRouteExtension.properties.path).toBe('/quickstarts-manager/*');
      expect(typeof quickstartsManagerRouteExtension.properties.component).toBe('function');
      expect(quickstartsManagerRouteExtension.properties.component()).toBeInstanceOf(Promise);
    });
  });

  describe('settingsNavExtension', () => {
    it('should define Settings nav item under quickstarts-manager section', () => {
      expect(settingsNavExtension.type).toBe('app.navigation/href');
      expect(settingsNavExtension.properties.id).toBe('quickstarts-manager-settings');
      expect(settingsNavExtension.properties.title).toBe('Settings');
      expect(settingsNavExtension.properties.href).toBe('/quickstarts-manager/settings');
      expect(settingsNavExtension.properties.section).toBe('quickstarts-manager');
    });
  });

  describe('extensions array', () => {
    it('should contain all six extensions', () => {
      expect(extensions).toHaveLength(6);
    });

    it('should include all extensions in the correct order', () => {
      expect(extensions).toEqual([
        communityPluginsSectionExtension,
        quickstartsManagerAreaExtension,
        quickstartsManagerSectionExtension,
        quickstartsNavExtension,
        settingsNavExtension,
        quickstartsManagerRouteExtension,
      ]);
    });
  });
});
