export const GUEST_CREDENTIAL_KEY="guild-to-glory.guest-credential";
const valid=(v:unknown):v is string=>typeof v==="string" && /^[a-f0-9]{64}$/.test(v);
interface Storage { getItem(key:string):string|null; setItem(key:string,value:string):void }
type Lock = (name:string,work:()=>Promise<string>)=>Promise<string>;
export function createGuestAccountClient(storage:()=>Storage,request:()=>Promise<unknown>,lock?:Lock) {
  let inFlight:Promise<string>|undefined;
  let issued:string|undefined;
  async function initialize():Promise<string> {
    const store=storage();
    const existing=store.getItem(GUEST_CREDENTIAL_KEY);
    if(existing!==null){if(!valid(existing))throw Error("Invalid stored Guest credential. It has not been replaced.");return existing;}
    if(!issued){
      const response=await request();
      if(!response || typeof response!=="object" || !("credential" in response) || !valid(response.credential))throw Error("Invalid Guest creation response.");
      issued=response.credential;
    }
    // Retain an issued credential in memory if storage fails, so Retry does not create another account.
    store.setItem(GUEST_CREDENTIAL_KEY,issued);
    return issued;
  }
  return {ensure():Promise<string>{
    if(!inFlight){
      const pending=lock ? lock(GUEST_CREDENTIAL_KEY,initialize) : initialize();
      inFlight=pending.finally(()=>{inFlight=undefined;});
    }
    return inFlight;
  }};
}
export function browserGuestAccount(serverUrl:string) {
  const url=new URL(serverUrl);
  url.protocol=(url.protocol==="wss:" || url.protocol==="https:")?"https:":"http:";
  url.pathname=url.pathname.replace(/\/$/,"")+"/guest-account";url.search="";url.hash="";
  const account=createGuestAccountClient(()=>window.localStorage,async()=>{
    let response:Response;
    try {response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",credentials:"omit",cache:"no-store",signal:AbortSignal.timeout(10000)});}
    catch {throw Error("Guest server unavailable. Please retry.");}
    if(!response.ok)throw Error(response.status===429?"Guest creation limit reached. Please retry later.":"Guest server unavailable. Please retry.");
    return response.json();
  },navigator.locks ? async (name,work)=>await navigator.locks.request(name,work) : undefined);
  return {async ensure(){
    if(window.location.protocol==="https:" && url.protocol!=="https:")throw Error("HTTPS requires a secure WSS server URL.");
    return account.ensure();
  }};
}
