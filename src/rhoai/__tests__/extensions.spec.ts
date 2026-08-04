import {
  quickstartsManagerAreaExtension,
  communityPluginsSectionExtension,
  quickstartsManagerSectionExtension,
  userInfoNavExtension,
  clusterResourcesNavExtension,
  namespaceSummaryNavExtension,
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
    it('should define User Info nav item under quickstarts-manager section', () => {
      expect(userInfoNavExtension.type).toBe('app.navigation/href');
      expect(userInfoNavExtension.properties.id).toBe('quickstarts-manager-user-info');
      expect(userInfoNavExtension.properties.title).toBe('User Info');
      expect(userInfoNavExtension.properties.href).toBe('/quickstarts-manager/user-info');
      expect(userInfoNavExtension.properties.section).toBe('quickstarts-manager');
      expect(userInfoNavExtension.properties.path).toBe('/quickstarts-manager/user-info/*');
    });

    it('should define Cluster Resources nav item under quickstarts-manager section', () => {
      expect(clusterResourcesNavExtension.type).toBe('app.navigation/href');
      expect(clusterResourcesNavExtension.properties.id).toBe('quickstarts-manager-cluster-resources');
      expect(clusterResourcesNavExtension.properties.title).toBe('Cluster Resources');
      expect(clusterResourcesNavExtension.properties.href).toBe('/quickstarts-manager/cluster-resources');
      expect(clusterResourcesNavExtension.properties.section).toBe('quickstarts-manager');
      expect(clusterResourcesNavExtension.properties.path).toBe('/quickstarts-manager/cluster-resources/*');
    });

    it('should define Namespace Summary nav item under quickstarts-manager section', () => {
      expect(namespaceSummaryNavExtension.type).toBe('app.navigation/href');
      expect(namespaceSummaryNavExtension.properties.id).toBe('quickstarts-manager-namespace-summary');
      expect(namespaceSummaryNavExtension.properties.title).toBe('Namespace Summary');
      expect(namespaceSummaryNavExtension.properties.href).toBe('/quickstarts-manager/namespace-summary');
      expect(namespaceSummaryNavExtension.properties.section).toBe('quickstarts-manager');
      expect(namespaceSummaryNavExtension.properties.path).toBe('/quickstarts-manager/namespace-summary/*');
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

  describe('extensions array', () => {
    it('should contain all seven extensions', () => {
      expect(extensions).toHaveLength(7);
    });

    it('should include all extensions in the correct order', () => {
      expect(extensions).toEqual([
        communityPluginsSectionExtension,
        quickstartsManagerAreaExtension,
        quickstartsManagerSectionExtension,
        userInfoNavExtension,
        clusterResourcesNavExtension,
        namespaceSummaryNavExtension,
        quickstartsManagerRouteExtension,
      ]);
    });
  });
});
