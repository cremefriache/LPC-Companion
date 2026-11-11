import layoutPolicy from '../../vendor/lpc/full-catalog/layout-preparation.json' with { type: 'json' };
import { getSourceCertificate } from './source-certificates.mjs';

/** Display preparation is separate from the original artwork's authors/licenses. */
export function sourcePreparationAttribution(assets, eligibleItemIds, nativeTransformIds, layoutTransformIds) {
    const nativePolicy = getSourceCertificate('native-repairs.json'),
        policy = getSourceCertificate('hurt-phases.json');
    const eligible = eligibleItemIds && new Set(eligibleItemIds);
    const selected = assets && new Set(assets.map(a => [a.sourceItemId, a.sourcePath, a.assetSha256].join('\n')));
    const result = policy.transforms.filter(r => (!eligible || eligible.has(r.itemId)) && (!selected || selected.has([r.itemId,
        r.path, r.sha256].join('\n')))).map(r => ({
        itemId: r.itemId,
        sourcePath: r.path,
        sourceSha256: r.sha256,
        change: 'Missing standing Hurt frames are prepared from existing same-sheet glyphs. Original PNG bytes are unchanged.',
        copies: r.copies.map(copy => ({ ...copy })),
        implementationLicense: 'GPL-3.0'
    }));
    const layout = layoutTransformIds && new Set(layoutTransformIds),
        padding = layoutPolicy.transforms.filter(r => (!assets || layout?.has(r.id)) && (!selected || selected.has([r.itemId,
            r.path, r.sha256].join('\n')))).map(r => ({
            itemId: r.itemId,
            sourcePath: r.path,
            sourceSha256: r.sha256,
            preparationId: r.id,
            change: 'Two transparent bottom rows complete the declared canvas; all original source pixels and PNG bytes are unchanged.',
            sourceDimensions: [r.sourceWidth, r.sourceHeight],
            preparedDimensions: [r.outputWidth, r.outputHeight],
            copies: [],
            implementationLicense: 'GPL-3.0'
        }));
    const native = nativeTransformIds && new Set(nativeTransformIds);
    return [
        ...result,
        ...padding,
        ...nativePolicy.transforms.filter(r => (!assets || native?.has(r.id)) && (!selected || selected.has([r.itemId,
            r.path, r.sha256].join('\n')))).map(r => ({
            itemId: r.itemId,
            sourcePath: r.path,
            sourceSha256: r.sha256,
            preparationId: r.id,
            change: 'Missing terminal frames are prepared from existing same-sheet glyphs only for verified matching body/head poses. Original PNG bytes are unchanged.',
            copies: r.copies.map(c => ({ ...c, from: [...c.from], to: [...c.to] })),
            implementationLicense: 'GPL-3.0'
        }))
    ];
}
