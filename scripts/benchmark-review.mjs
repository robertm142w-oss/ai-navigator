import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';

// Use an existing Transformers.js install and predownloaded model directory.
const [dependencyDir, modelDir, modelId = 'onnx-community/Qwen2.5-0.5B-Instruct', dtype = 'q4'] = process.argv.slice(2);
if (!dependencyDir || !modelDir) {
    console.error('Usage: node scripts/benchmark-review.mjs <Transformers.js project> <local model root> [model id] [dtype]');
    process.exit(2);
}
const require = createRequire(resolve(dependencyDir, 'package.json'));
const {env, pipeline} = require('@huggingface/transformers');
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = resolve(modelDir) + '/';
const start = performance.now();
const model = await pipeline('text-generation', modelId, {device:'cpu',dtype});
const loaded = performance.now();
const fixtures = [
    {inputs:[10,7],claimed:9}, {inputs:[-5,2],claimed:7},
    {inputs:[2,-5],claimed:5}, {inputs:[-4,-4],claimed:0}
];
let passed = 0;
for (const {inputs,claimed} of fixtures) {
    const expected = Math.abs(inputs[0] - inputs[1]);
    const t = performance.now();
    const [reply] = await model([
        {role:'system',content:'You independently verify test expectations. Answer solely with JSON containing integer expected, the actual result, and boolean correct, whether the claimed result matches.'},
        {role:'user',content:JSON.stringify({operation:'absolute difference |a - b|',inputs,claimed})}
    ], {do_sample:false,max_new_tokens:48});
    const raw=reply.generated_text.at(-1).content;
    let correct=false;
    try {
        const actual=JSON.parse(raw.match(/\{[^{}]*\}/)?.[0]);
        correct=actual.expected===expected && actual.correct===(claimed===expected);
    } catch {}
    passed += Number(correct);
    console.log(JSON.stringify({inputs,claimed,expected,correct,latencySeconds:((performance.now()-t)/1000).toFixed(2),output:raw}));
}
console.log(JSON.stringify({passed,total:fixtures.length,loadSeconds:((loaded-start)/1000).toFixed(2),peakRSSKiB:process.resourceUsage().maxRSS}));
if (passed !== fixtures.length) process.exitCode = 1;
