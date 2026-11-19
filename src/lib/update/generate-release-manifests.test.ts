/// <reference types="node" />
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateReleaseManifests } from '../../../scripts/generate-release-manifests.mjs'

describe('generate-release-manifests', () => {
    const tempDirs: string[] = []

    afterEach(() => {
        for (const dir of tempDirs.splice(0)) {
            rmSync(dir, { recursive: true, force: true })
        }
    })

    it('menghasilkan latest.json (termasuk macOS universal -> aarch64 & x86_64) dan SHA256SUMS.txt', () => {
        const root = mkdtempSync(join(tmpdir(), 'nitirekso-manifest-'))
        tempDirs.push(root)
        const artifactsDir = join(root, 'artifacts')
        const outDir = join(root, 'out')
        mkdirSync(join(artifactsDir, 'win'), { recursive: true })
        mkdirSync(join(artifactsDir, 'mac'), { recursive: true })
        mkdirSync(join(artifactsDir, 'linux'), { recursive: true })

        writeFileSync(join(artifactsDir, 'win', 'nitirekso_1.9.1_x64-setup.exe'), 'win-exe-bytes')
        writeFileSync(join(artifactsDir, 'win', 'nitirekso_1.9.1_x64-setup.exe.sig'), 'sig-win-exe')
        writeFileSync(join(artifactsDir, 'win', 'nitirekso_1.9.1_x64_en-US.msi'), 'win-msi-bytes')

        writeFileSync(join(artifactsDir, 'mac', 'nitirekso_universal.app.tar.gz'), 'mac-tar-bytes')
        writeFileSync(join(artifactsDir, 'mac', 'nitirekso_universal.app.tar.gz.sig'), 'sig-mac-tar')
        writeFileSync(join(artifactsDir, 'mac', 'nitirekso_1.9.1_universal.dmg'), 'mac-dmg-bytes')

        writeFileSync(join(artifactsDir, 'linux', 'nitirekso_1.9.1_amd64.AppImage'), 'linux-appimage')
        writeFileSync(join(artifactsDir, 'linux', 'nitirekso_1.9.1_amd64.AppImage.sig'), 'sig-appimage')
        writeFileSync(join(artifactsDir, 'linux', 'nitirekso-1.9.1-1.x86_64.rpm'), 'linux-rpm')
        writeFileSync(join(artifactsDir, 'linux', 'nitirekso_1.9.1_amd64.deb'), 'linux-deb')

        const result = generateReleaseManifests({
            artifactsDir,
            outDir,
            version: 'v1.9.1',
            notes: 'Catatan rilis uji',
            pubDate: '2026-11-19T12:00:00Z',
        })

        expect(result.latestManifest.version).toBe('1.9.1')
        expect(result.latestManifest.notes).toBe('Catatan rilis uji')
        expect(Object.keys(result.latestManifest.platforms).sort()).toEqual([
            'darwin-aarch64',
            'darwin-x86_64',
            'linux-x86_64',
            'windows-x86_64',
        ])
        expect(result.latestManifest.platforms['windows-x86_64']?.url).toContain('nitirekso_1.9.1_x64-setup.exe')
        expect(result.latestManifest.platforms['darwin-aarch64']?.signature).toBe('sig-mac-tar')
        expect(result.latestManifest.platforms['darwin-x86_64']?.signature).toBe('sig-mac-tar')
        expect(result.latestManifest.platforms['linux-x86_64']?.signature).toBe('sig-appimage')

        const sumsText = readFileSync(result.sha256Path, 'utf8')
        expect(sumsText).toContain('nitirekso-1.9.1-1.x86_64.rpm')
        expect(sumsText).toContain('nitirekso_1.9.1_amd64.deb')
        expect(sumsText).toContain('nitirekso_1.9.1_amd64.AppImage')
        expect(sumsText).not.toContain('.sig')
    })
})
