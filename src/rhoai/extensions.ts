// [SHARED] Common section for all community plugins — never changes across plugins.
// Do not change the id or name: all community plugins share this section
// so they appear grouped together in the dashboard sidebar.
export const communityPluginsSectionExtension = {
  type: 'app.navigation/section' as const,
  properties: {
    id: 'community-plugins', // [SHARED] common section for all community plugins
    title: 'Community plugins', // [SHARED]
    group: '9_plugins', // [SHARED]
    iconRef: () => import(/* webpackMode: "eager" */ './CommunityNavIcon'),
  },
};

// [PLUGIN-SPECIFIC] Everything below is specific to this plugin

export const quickstartsManagerAreaExtension = {
  type: 'app.area' as const,
  properties: {
    id: 'quickstarts-manager', // [PLUGIN-SPECIFIC] unique area ID
    featureFlags: [] as string[],
  },
};

export const quickstartsManagerSectionExtension = {
  type: 'app.navigation/section' as const,
  properties: {
    id: 'quickstarts-manager', // [PLUGIN-SPECIFIC] unique nav section ID
    title: 'Quickstarts Manager', // [PLUGIN-SPECIFIC] display name in sidebar
    group: '1_quickstarts_manager', // [PLUGIN-SPECIFIC] sort key within community-plugins
    section: 'community-plugins', // [SHARED] must match communityPluginsSectionExtension.id — do not change
    iconRef: () => import(/* webpackMode: "eager" */ '~/app/components/QuickstartsManagerNavIcon'),
  },
};

export const quickstartsNavExtension = {
  type: 'app.navigation/href' as const,
  properties: {
    id: 'quickstarts-manager-quickstarts', // [PLUGIN-SPECIFIC] unique nav item ID
    title: 'Quickstarts',
    href: '/quickstarts-manager/quickstarts', // [PLUGIN-SPECIFIC] must match route prefix
    section: 'quickstarts-manager', // [PLUGIN-SPECIFIC] references this plugin's section ID
    path: '/quickstarts-manager/quickstarts/*', // [PLUGIN-SPECIFIC] route-matching pattern
  },
};

export const settingsNavExtension = {
  type: 'app.navigation/href' as const,
  properties: {
    id: 'quickstarts-manager-settings', // [PLUGIN-SPECIFIC] unique nav item ID
    title: 'Settings',
    href: '/quickstarts-manager/settings', // [PLUGIN-SPECIFIC] must match route prefix
    section: 'quickstarts-manager', // [PLUGIN-SPECIFIC] references this plugin's section ID
    path: '/quickstarts-manager/settings/*', // [PLUGIN-SPECIFIC] route-matching pattern
  },
};

export const quickstartsManagerRouteExtension = {
  type: 'app.route' as const,
  properties: {
    path: '/quickstarts-manager/*', // [PLUGIN-SPECIFIC] top-level route prefix
    component: () => import(/* webpackMode: "eager" */ '~/app/App'),
  },
};

export const extensions = [
  communityPluginsSectionExtension,
  quickstartsManagerAreaExtension,
  quickstartsManagerSectionExtension,
  quickstartsNavExtension,
  settingsNavExtension,
  quickstartsManagerRouteExtension,
];

export default extensions;
