import test from 'ava'
import { render } from '../../../scripts/render-all-api-evidence.mjs'

test('publication rejects incomplete, smoke and insufficient reports', (t) => {
  for (const report of [
    { complete: false },
    { complete: true, smoke: true },
    { complete: true, smoke: false, samples: 2, warmups: 1 },
    { complete: true, smoke: false, samples: 10, warmups: 2, cases: [] },
  ])
    t.throws(() => render([report]))
})
