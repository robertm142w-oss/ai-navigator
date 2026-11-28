const STAGES = ['plan', 'draft', 'review', 'revision'];

function nonblank(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function validatePlan(plan) {
    if (!plan || typeof plan !== 'object' || Object.keys(plan).length !== 1 ||
        !Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 3 ||
        !Array.from(plan.steps).every(nonblank)) {
        throw new Error('Plan must contain one to three nonblank steps.');
    }
    return { steps: [...plan.steps] };
}

function stageText(stage, text) {
    if (!nonblank(text)) throw new Error(stage + ' must return nonblank text.');
    if (stage !== 'plan') return text;

    let plan;
    try {
        plan = JSON.parse(text);
    } catch {
        throw new Error('Plan must be valid JSON.');
    }
    return validatePlan(plan);
}

function readCheckpoint(saved, request) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
        throw new Error('Invalid saved workflow.');
    }
    if (saved.request !== request) throw new Error('This ID already belongs to a different request.');

    const state = { request };
    let hasGap = false;
    for (const stage of STAGES) {
        if (!Object.hasOwn(saved, stage)) {
            hasGap = true;
            continue;
        }
        if (hasGap) throw new Error('Invalid saved workflow stage order.');
        if (stage === 'plan') state.plan = validatePlan(saved.plan);
        else {
            if (!nonblank(saved[stage])) throw new Error('Invalid saved ' + stage + '.');
            state[stage] = saved[stage];
        }
    }
    return state;
}

/** Persist a checkpoint after accepting each stage. No returned text is executed. */
export function createWorkflow({ infer, load, save, verify }) {
    const active = new Set();
    if (![infer, load, save, verify].every(callback => typeof callback === 'function')) {
        throw new TypeError('Workflow callbacks must be functions.');
    }

    async function run(id, request) {
        if (!nonblank(id) || !nonblank(request)) {
            throw new TypeError('Workflow ID and request must be nonblank strings.');
        }
        if (active.has(id)) throw new Error('This workflow ID is already running.');
        active.add(id);

        try {
            const saved = await load(id);
            let state;
            if (saved == null) {
                state = { request };
                await save(id, { request });
            } else {
                state = readCheckpoint(saved, request);
            }

            for (const stage of STAGES) {
                if (Object.hasOwn(state, stage)) continue;

                const output = stageText(stage, await infer(stage, structuredClone(state)));
                if (stage === 'revision' && await verify(output, structuredClone(state)) !== true) {
                    throw new Error('Revision failed verification.');
                }
                const checkpoint = { ...state, [stage]: output };
                await save(id, structuredClone(checkpoint));
                state = checkpoint;
            }

            const { plan, draft, review, revision } = state;
            return { status: 'awaiting_approval', plan, draft, review, revision };
        } finally {
            active.delete(id);
        }
    }

    return { run };
}
