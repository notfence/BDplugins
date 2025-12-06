/**
 * @name QuickPluginShortcut
 * @version 1.0.0
 * @description Quick shortcut to open BetterDiscord plugin settings page
 * @author notfence
 * @authorId 1176524761686364226
 * @source https://github.com/notfence/BDplugins/tree/main/Plugins/QuickPluginShortcut
 * @updateurl https://raw.githubusercontent.com/notfence/BDplugins/refs/heads/main/Plugins/QuickPluginShortcut/QuickPluginShortcut.plugin.js
 */
const { Webpack, Data, UI } = BdApi;
class QuickPluginShortcut {
  constructor(meta){
    this.meta=meta;
    this.defaultSettings={enabled:true,showWindow:true,keys:["Alt","F"],position:"bottom-right"};
    this.settings=Object.assign({},this.defaultSettings,Data.load(this.meta.name,"settings")||{});
    this._pressed=new Set();
    this._log=(...a)=>{try{console.log(...a)}catch{}};
  }
  start(){
    this._kd=this._kd.bind(this);
    this._ku=this._ku.bind(this);
    this._bl=this._bl.bind(this);
    document.addEventListener("keydown",this._kd,true);
    document.addEventListener("keyup",this._ku,true);
    window.addEventListener("blur",this._bl);
    this._log("QuickPluginShortcut started — keys:",this.settings.keys);
    if(this.settings.showWindow) this.createWindow();
  }
  stop(){
    document.removeEventListener("keydown",this._kd,true);
    document.removeEventListener("keyup",this._ku,true);
    window.removeEventListener("blur",this._bl);
    Data.save(this.meta.name,"settings",this.settings);
    if(this.window){this.window.remove();this.window=null}
    this._pressed.clear();
    this._log("QuickPluginShortcut stopped.");
  }
  _kd(e){try{if(e&&e.code)this._pressed.add(e.code);this._check(e)}catch{}}
  _ku(e){try{if(e&&e.code)this._pressed.delete(e.code)}catch{}}
  _bl(){try{this._pressed.clear()}catch{}}
  _norm(k){
    if(!k) return null;
    const m=["Control","Shift","Alt","Meta"];
    if(m.includes(k)) return k;
    if(/^F\d{1,2}$/i.test(k)) return "F"+k.match(/\d+/)[0];
    if(/^Tab$/i.test(k)) return "Tab";
    if(/^CapsLock$/i.test(k)) return "CapsLock";
    if(/^[a-z]$/i.test(k)) return "Key"+k.toUpperCase();
    if(/^[0-9]$/.test(k)) return "Digit"+k;
    if(/^(Key|Digit|Numpad|F|Tab|CapsLock)\w*/i.test(k)) return k;
    return k;
  }
  _valid(arr){
    if(!Array.isArray(arr)||arr.length<2) return false;
    const mods=["Control","Shift","Alt","Meta"];
    const non=arr.filter(k=>!mods.includes(k));
    if(non.length>2) return false;
    if(non.length===0) return true;
    for(const key of non){
      if(typeof key!=="string"||!key.length) return false;
      if(/^[A-Za-z]$/.test(key)||/^[0-9]$/.test(key)||/^(Key|Digit|Numpad|F)\w+/i.test(key)||/^(Tab|CapsLock)$/i.test(key)) continue;
      if(key.length===1){
        const c=key.charCodeAt(0);
        if(c>=33&&c<=126&&!/^[A-Za-z0-9]$/.test(key)) continue;
      }
      return false;
    }
    return true;
  }
  _check(e){
    try{
      if(!this.settings.enabled) return;
      const req=Array.isArray(this.settings.keys)?this.settings.keys.slice():[];
      const mods=["Control","Shift","Alt","Meta"];
      const wantCtrl=req.includes("Control"),wantShift=req.includes("Shift"),wantAlt=req.includes("Alt"),wantMeta=req.includes("Meta");
      if((e.ctrlKey||false)!==wantCtrl||(e.shiftKey||false)!==wantShift||(e.altKey||false)!==wantAlt||(e.metaKey||false)!==wantMeta) return;
      const non=req.filter(k=>!mods.includes(k));
      if(non.length===0){e.preventDefault();e.stopPropagation();this.openBDPlugins();return}
      const ok=non.every(k=>{
        const code=this._norm(k);
        if(!code) return false;
        if(/^CapsLock$/i.test(code)){
          try{if(e.getModifierState&&e.getModifierState("CapsLock")) return true}catch{}
          if(this._pressed.has("CapsLock")) return true;
          return false;
        }
        if(this._pressed.has(code)) return true;
        if(e&&e.code===code) return true;
        if(String(code).startsWith("Key") && (e.key||"").toLowerCase()===(code.slice(3).toLowerCase())) return true;
        if(String(code).startsWith("Digit") && (e.key||"")===(code.slice(5))) return true;
        if(String(code).startsWith("F") && e.code===code) return true;
        if((e.key||"").toLowerCase()===(k||"").toLowerCase()) return true;
        return false;
      });
      if(ok){e.preventDefault();e.stopPropagation();this.openBDPlugins();return}
    }catch(err){console.error("QuickPluginShortcut handleKey error",err)}
  }
  async openBDPlugins(){
    try{
      const SettingsWindow=Webpack.getModule(m=>m&&typeof m.setSection==="function"&&typeof m.open==="function");
      if(SettingsWindow){
        for(const s of ["PLUGINS","Plugins","BETTERDISCORD_PLUGINS","bd-plugins","plugins"])try{SettingsWindow.setSection(s)}catch{}
        try{SettingsWindow.open();return}catch{}
      }
    }catch{}
    const safeClick=el=>{try{el&&el.click&&el.click()}catch{}};
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const findByText=(regex,root=document)=>{const w=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT,null,false);let n;while(n=w.nextNode()){const t=(n.textContent||"").toLowerCase().trim();if(t&&regex.test(t))return n}return null};
    for(let i=0;i<15;i++){
      try{
        const bd=findByText(/betterdiscord|bandagedbd/);
        if(bd){safeClick(bd);await wait(120);const p=findByText(/plugin|плаг|插件/);if(p){safeClick(p);return}}
        const pg=findByText(/plugin(s)?|плаг(ин|ины)?|插件/);
        if(pg){safeClick(pg);return}
      }catch{}
      await wait(100);
    }
  }
  createWindow(){
    if(this.window){this.window.remove();this.window=null}
    this.window=document.createElement("div");
    this.window.textContent=Array.isArray(this.settings.keys)?this.settings.keys.map(k=>/^[a-z]$/i.test(k)?k.toUpperCase():k).join(" + "):this.settings.keys;
    Object.assign(this.window.style,{position:"fixed",background:"rgba(0,0,0,.5)",color:"gray",borderRadius:"6px",padding:"4px 8px",fontSize:"15px",zIndex:"9999",cursor:"pointer",userSelect:"none"});
    this.updateWindowPosition();
    this.window.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();this.openBDPlugins()});
    this.window.style.display=(this.settings.enabled&&this.settings.showWindow)?"":"none";
    document.body.appendChild(this.window);
  }
  updateWindowPosition(){
    if(!this.window) return;
    const pos=this.settings.position;this.window.style.top="";this.window.style.bottom="";this.window.style.left="";this.window.style.right="";
    const o="10px";
    switch(pos){case"top-left":this.window.style.top=o;this.window.style.left=o;break;case"top-right":this.window.style.top=o;this.window.style.right=o;break;case"bottom-left":this.window.style.bottom=o;this.window.style.left=o;break;case"bottom-right":default:this.window.style.bottom=o;this.window.style.right=o;break}
  }
  getSettingsPanel(){
    const panel=UI.buildSettingsPanel({settings:[
      {type:"switch",id:"enabled",name:"Enable QuickPluginShortcut",note:"Open the BetterDiscord plugin settings with your shortcut.",value:this.settings.enabled},
      {type:"switch",id:"showWindow",name:"Show Mini Window",note:"Display the small floating mini window with current keybind.",value:this.settings.showWindow},
      {type:"dropdown",id:"position",name:"Window Position",note:"Position of the mini window displaying the current keybind.",options:[{value:"top-left",label:"Top Left"},{value:"top-right",label:"Top Right"},{value:"bottom-right",label:"Bottom Right"},{value:"bottom-left",label:"Bottom Left"}],value:this.settings.position},
      {type:"keybind",id:"keys",name:"Keybinding",note:"Allowed: Latin letters (A-Z), digits (0-9), modifier and function keys. Minimum 2 keys required.",value:this.settings.keys,clearable:false}],
      onChange:(_cat,id,value)=>{if(id==="enabled"){this.settings.enabled=value;Data.save(this.meta.name,"settings",this.settings);if(this.window)this.window.style.display=(this.settings.enabled&&this.settings.showWindow)?"":"none";return}if(id==="showWindow"){this.settings.showWindow=value;Data.save(this.meta.name,"settings",this.settings);if(value){if(!this.window)this.createWindow();else this.window.style.display=(this.settings.enabled&&this.settings.showWindow)?"":"none"}else if(this.window)this.window.style.display="none";return}
      if(id==="keys"){if(this._valid(value)){this.settings.keys=Array.isArray(value)?value.slice():value;Data.save(this.meta.name,"settings",this.settings);if(this.window)this.window.textContent=Array.isArray(this.settings.keys)?this.settings.keys.map(k=>/^[a-z]$/i.test(k)?k.toUpperCase():k).join("+"):(/^[a-z]$/i.test(this.settings.keys)?this.settings.keys.toUpperCase():this.settings.keys);if(UI.showToast)UI.showToast("Keybind saved!",{type:"success",icon:true})}else if(UI.showToast)UI.showToast("Invalid keybind: only Latin letters, digits, modifier and function keys. Мinimum 2 keys required.",{type:"error",icon:true});return}if(id==="position"){this.settings.position=value;Data.save(this.meta.name,"settings",this.settings);this.updateWindowPosition();return}Data.save(this.meta.name,"settings",this.settings)
      }});
    return panel;
  }
}
module.exports=QuickPluginShortcut;
