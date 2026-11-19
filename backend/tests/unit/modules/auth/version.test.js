const { cadenceVersion } = require('../../../../modules/auth/version');

describe('cadenceVersion', () => {
    it('gives the Cadence version and the build commit from the image', () => {
        expect(
            cadenceVersion(
                { version: 'v1.14.0', cadenceVersion: '2026.11.19' },
                { CADENCE_BUILD: '95aa5a17df4979e5ec60ea1393f033a5fe685a03' }
            )
        ).toEqual({
            version: '2026.11.19',
            build: '95aa5a1',
            label: 'Cadence 2026.11.19',
            upstream: 'v1.14.0',
        });
    });

    it('says dev for a build without a commit', () => {
        expect(
            cadenceVersion(
                { version: 'v1.14.0', cadenceVersion: '2026.11.19' },
                {}
            ).build
        ).toBe('dev');
    });

    it('matches the top entry of the changelog', () => {
        const fs = require('fs');
        const path = require('path');
        const root = path.join(__dirname, '../../../../..');
        const pkg = require(path.join(root, 'package.json'));
        const log = fs.readFileSync(
            path.join(root, 'docs/fork/CHANGELOG.md'),
            'utf8'
        );
        const top = log.match(/^## (\S+)/m);
        expect(top && top[1]).toBe(pkg.cadenceVersion);
    });
});
