'use strict';

// The version the app shows (docs/fork/CHANGELOG.md): Cadence's own, dated
// version from package.json `cadenceVersion`, and the commit the image was
// built from (CADENCE_BUILD, set by the image build). `version` of
// package.json stays upstream tududi's, for merges.
const cadenceVersion = (pkg, env = process.env) => {
    const version = pkg.cadenceVersion || pkg.version;
    const build = (env.CADENCE_BUILD || '').trim().slice(0, 7) || 'dev';
    return {
        version,
        build,
        label: `Cadence ${version} · ${build}`,
        upstream: pkg.version,
    };
};

module.exports = { cadenceVersion };
