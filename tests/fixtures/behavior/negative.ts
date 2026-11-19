// window.alert('not an actual call');
const documentation = "document.write('text')";
const object = { alert() {}, confirm() {}, prompt() {}, write() {} };
object.alert();
object.confirm();
object.prompt();
object.write();
function report(alert: (message: string) => void) { alert('local function'); }
export { documentation, report };
