import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CHANGELOG_ENTRIES,
    CHANGELOG_TEXT,
    EXTENSION_DISPLAY_NAME,
    EXTENSION_VERSION,
} from '../src/catalog/release-info.mjs';
import { bumpSemver, ensureChangelogEntry, SEMVER_RE, syncVersionFiles } from '../tools/version.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

test('package, lockfile, manifest, and consumer CHANGELOG.txt stay in strict SemVer parity', async () => {
    const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
    const lock = JSON.parse(await readFile(path.join(ROOT, 'package-lock.json'), 'utf8'));
    const extManifest = JSON.parse(await readFile(path.join(ROOT, 'extension/manifest.json'), 'utf8'));
    const changelog = await readFile(path.join(ROOT, 'CHANGELOG.txt'), 'utf8');

    assert.ok(SEMVER_RE.test(pkg.version), `Expected clean SemVer in package.json, got ${pkg.version}`);
    assert.equal(pkg.version.includes('-dev.'), false, 'Retired -dev.* suffix must not reappear');
    assert.equal(lock.version, pkg.version);
    assert.equal(lock.packages?.['']?.version, pkg.version);
    assert.equal(extManifest.version, pkg.version);
    assert.equal(extManifest.display_name, 'LPC Companion');
    assert.equal(EXTENSION_VERSION, pkg.version);
    assert.equal(EXTENSION_DISPLAY_NAME, extManifest.display_name);
    assert.equal(CHANGELOG_TEXT, changelog);
    assert.ok(CHANGELOG_ENTRIES.length >= 1, 'CHANGELOG_ENTRIES must include at least one version');
    assert.equal(CHANGELOG_ENTRIES[0].version, pkg.version);
    assert.ok(CHANGELOG_ENTRIES[0].groups.some(group => group.items.length > 0), 'Current version must list highlights');

    try {
        await access(path.join(ROOT, 'manifest.json'));
        const rootManifest = JSON.parse(await readFile(path.join(ROOT, 'manifest.json'), 'utf8'));
        assert.equal(rootManifest.version, pkg.version);
        assert.equal(rootManifest.display_name, 'LPC Companion');
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    try {
        await access(path.join(ROOT, 'install-build.json'));
        const installBuild = JSON.parse(await readFile(path.join(ROOT, 'install-build.json'), 'utf8'));
        assert.equal(installBuild.version, pkg.version);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    const escapedVersion = pkg.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(changelog, new RegExp(`^Version\\s+${escapedVersion}\\b`, 'm'), 'CHANGELOG.txt must document the current version');

    // Enforce strictly consumer-facing prose in CHANGELOG.txt (no internal code paths, hashes, or developer jargon).
    const forbiddenTechnicalPatterns = [
        /\.mjs\b/,
        /\bsha-?256\b/i,
        /\bschemaVersion\b/,
        /\blocalStorage\b/,
        /\bsessionStorage\b/,
        /\besbuild\b/i,
        /\bjsonl\b/i,
        /\buuid\b/i,
        /\bgzip(?:ped)?\b/i,
        /\bsrc\//,
        /\btools\//,
        /--SmartTheme/,
        /--lpc-/,
    ];
    for (const pattern of forbiddenTechnicalPatterns) {
        assert.equal(pattern.test(changelog), false, `CHANGELOG.txt must stay consumer-facing (matched ${pattern})`);
    }
});

test('bumpSemver, ensureChangelogEntry, and syncVersionFiles bump patch, minor, and major cleanly', async () => {
    assert.equal(bumpSemver('0.2.0', 'patch'), '0.2.1');
    assert.equal(bumpSemver('0.2.4', 'minor'), '0.3.0');
    assert.equal(bumpSemver('0.3.1', 'major'), '1.0.0');

    const sandbox = await mkdtemp(path.join(tmpdir(), 'lpc-version-unit-'));
    try {
        await mkdir(path.join(sandbox, 'extension'), { recursive: true });
        await writeFile(path.join(sandbox, 'package.json'), JSON.stringify({ name: 'lpc-companion', version: '0.2.0' }, null, 2));
        await writeFile(path.join(sandbox, 'package-lock.json'), JSON.stringify({
            name: 'lpc-companion',
            version: '0.2.0',
            lockfileVersion: 3,
            packages: { '': { name: 'lpc-companion', version: '0.2.0' } },
        }, null, 2));
        await writeFile(path.join(sandbox, 'extension/manifest.json'), JSON.stringify({
            display_name: 'LPC Companion (development)',
            version: '0.2.0',
        }, null, 2));
        await writeFile(
            path.join(sandbox, 'CHANGELOG.txt'),
            "LPC Companion — What's New\n==========================\n\nVersion 0.2.0 (2026-11-10)\n--------------------------\n- Initial beta release.\n",
        );

        await syncVersionFiles({ rootDir: sandbox, targetVersion: 'minor', dateString: '2026-12-01', rebuildInstaller: false });
        assert.equal(JSON.parse(await readFile(path.join(sandbox, 'package.json'), 'utf8')).version, '0.3.0');
        assert.equal(JSON.parse(await readFile(path.join(sandbox, 'package-lock.json'), 'utf8')).packages[''].version, '0.3.0');
        const bumpedManifest = JSON.parse(await readFile(path.join(sandbox, 'extension/manifest.json'), 'utf8'));
        assert.equal(bumpedManifest.version, '0.3.0');
        assert.equal(bumpedManifest.display_name, 'LPC Companion');

        const bumpedChangelog = await readFile(path.join(sandbox, 'CHANGELOG.txt'), 'utf8');
        assert.ok(bumpedChangelog.indexOf('Version 0.3.0 (2026-12-01)') < bumpedChangelog.indexOf('Version 0.2.0 (2026-11-10)'));
        assert.equal(ensureChangelogEntry(bumpedChangelog, '0.3.0', '2026-12-02'), bumpedChangelog);
        const generatedReleaseInfo = await readFile(path.join(sandbox, 'src/catalog/release-info.mjs'), 'utf8');
        assert.match(generatedReleaseInfo, /EXTENSION_VERSION = "0\.3\.0"/);

        await syncVersionFiles({ rootDir: sandbox, targetVersion: 'major', dateString: '2027-01-15', rebuildInstaller: false });
        assert.equal(JSON.parse(await readFile(path.join(sandbox, 'package.json'), 'utf8')).version, '1.0.0');
    } finally {
        await rm(sandbox, { recursive: true, force: true });
    }
});
