'use strict';
// Shared, browser-native Japanese TTS for the kana lesson and anime sentence page.
// SpeechSynthesis.getVoices() may be empty while voices load; never treat it as
// definitive evidence that ja-JP cannot be spoken.
window.KanaJapaneseSpeech=(()=>{
  const GOOGLE='google';
  const SYSTEM='system';
  const INVALID_VOICES=/(?:kyoto|kyoko|kyōko|kyouko|きょうこ|京都)/i;
  const GOOGLE_VOICE=/google/i;
  const FEMALE=/nanami|aoi|mayu|shiori|sakura|o-ren|mizuki|haruka|yuna|sayaka|hikari|yumi|女性|女声|女聲|female/i;
  const MALE=/keita|daichi|naoki|masaru|takumi|ichiro|otoya|hattori|男性|男声|男聲|male/i;
  let lastRequest=0;

  const supported=()=>('speechSynthesis'in window)&&typeof SpeechSynthesisUtterance!=='undefined';
  const voiceKey=v=>[v.name,v.lang,v.voiceURI].join('|');
  const voiceName=v=>(v.name||'')+' '+(v.voiceURI||'');
  const isGoogle=v=>GOOGLE_VOICE.test(voiceName(v));
  function voices(){
    if(!supported())return [];
    try{
      return window.speechSynthesis.getVoices().filter(v=>
        /^ja(?:-|$)/i.test(v.lang||'')&&!INVALID_VOICES.test(voiceName(v)));
    }catch{return []}
  }
  function chosenVoice(preference=GOOGLE){
    if(preference===SYSTEM)return null;
    const options=voices();
    const explicit=options.find(v=>voiceKey(v)===preference);
    if(explicit)return explicit;
    const google=options.filter(isGoogle);
    const candidates=google.length?google:options;
    const rank=v=>(FEMALE.test(v.name||'')?20:MALE.test(v.name||'')?0:10)+
      (/^ja-jp$/i.test(v.lang||'')?3:0);
    return [...candidates].sort((a,b)=>rank(b)-rank(a))[0]||null;
  }
  function status(preference=GOOGLE){
    if(!supported())return 'unsupported';
    const options=voices();
    if(!options.length)return 'basic';
    if(preference===SYSTEM)return 'basic';
    if(chosenVoice(preference)&&isGoogle(chosenVoice(preference)))return 'google';
    return 'japanese';
  }
  function speak(text,{rate=.82,preference=GOOGLE,onError=()=>{}}={}){
    if(!supported()){onError('unsupported');return false}
    if(!String(text||'').trim())return false;
    const synth=window.speechSynthesis;
    const requestId=++lastRequest;
    let started=false;
    const utterText=String(text).trim();
    const attempt=(selected,retry)=>{
      if(requestId!==lastRequest)return;
      try{
        const utterance=new SpeechSynthesisUtterance(utterText);
        utterance.lang='ja-JP';
        utterance.rate=rate;
        if(selected)utterance.voice=selected;
        utterance.onstart=()=>{started=true};
        utterance.onerror=event=>{
          if(requestId!==lastRequest||['canceled','interrupted'].includes(event.error))return;
          // If the named voice is broken, try the browser's ja-JP voice resolver.
          if(selected&&retry){attempt(null,false);return}
          onError(event.error||'synthesis-failed');
        };
        synth.cancel();
        if(synth.paused&&typeof synth.resume==='function')synth.resume();
        synth.speak(utterance);
      }catch{
        if(selected&&retry){attempt(null,false);return}
        onError('synthesis-failed');
      }
    };
    // Even when getVoices() is empty, an utterance with lang=ja-JP and no
    // explicit voice may still be spoken by the device's own TTS engine.
    attempt(chosenVoice(preference),true);
    return true;
  }
  return {supported,voices,voiceKey,isGoogle,chosenVoice,status,speak,GOOGLE,SYSTEM};
})();
