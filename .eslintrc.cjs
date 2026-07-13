// Root config for plain TS packages (packages/*). Nest apps and the web app
// override with their own .eslintrc.cjs extending @tickethub/eslint-config/{nest,next}.
module.exports = {
  root: true,
  extends: ['@tickethub/eslint-config/base'],
};
