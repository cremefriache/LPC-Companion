/** One writer queue shared by primary and roster operations in this page. */
export function createWorkQueue() {
    let tail=Promise.resolve();
    return {run(task){const next=tail.then(task);tail=next.catch(()=>{});return next;},whenIdle:()=>tail};
}
