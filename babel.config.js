// Custom Babel plugin: replace `import.meta` with `{}` so Metro web builds
// don't get a SyntaxError. Zustand v5 uses import.meta.env?.MODE.
function transformImportMeta({ types: t }) {
  return {
    name: 'transform-import-meta-to-empty-object',
    visitor: {
      MetaProperty(path) {
        if (
          path.node.meta.name === 'import' &&
          path.node.property.name === 'meta'
        ) {
          path.replaceWith(t.objectExpression([]));
        }
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      transformImportMeta,
      'react-native-reanimated/plugin',
    ],
  };
};
