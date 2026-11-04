'use strict';

// Card types the user keeps marking as noise. A type is dropped from the
// anticipate section once it has enough votes and most of them say "noise"
// (alerts.noise.minVotes and alerts.noise.ratio, docs/39-daily-brief.md).

// stats: { [card_type]: { useful, noise } } from decisions.noiseStats.
function noisyCardTypes(stats, settings) {
    const { minVotes, ratio } = settings.alerts.noise;
    const noisy = new Set();
    for (const [cardType, { useful = 0, noise = 0 }] of Object.entries(
        stats || {}
    )) {
        const votes = useful + noise;
        if (votes > 0 && votes >= minVotes && noise / votes >= ratio) {
            noisy.add(cardType);
        }
    }
    return noisy;
}

module.exports = { noisyCardTypes };
