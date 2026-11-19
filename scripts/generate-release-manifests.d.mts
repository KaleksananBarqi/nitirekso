export interface ReleaseManifestResult {
    latestManifest: {
        version: string
        notes: string
        pub_date: string
        platforms: Record<string, { signature: string; url: string }>
    }
    checksumLines: string[]
    latestJsonPath: string
    sha256Path: string
}

export function generateReleaseManifests(options: {
    artifactsDir: string
    outDir?: string
    version: string
    repo?: string
    notes?: string
    pubDate?: string
}): ReleaseManifestResult
