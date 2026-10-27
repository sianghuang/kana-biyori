'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const speech=window.KanaJapaneseSpeech;
  const KEY='kana-biyori-stay-with-me-lyrics-v1';
  const PROGRESS='kana-biyori-stay-with-me-progress-v1';
  const MODE='kana-biyori-stay-with-me-options-v1';
  const MAX_TEXT=24000;
  const MAX_LINES=200;
  // The complete lyric practice is derived exclusively from text supplied by the user.
  const BUILTIN=window.STAY_WITH_ME_BUILTIN||'';
  const KANA={
    あ:'a',い:'i',う:'u',え:'e',お:'o',か:'ka',き:'ki',く:'ku',け:'ke',こ:'ko',
    さ:'sa',し:'shi',す:'su',せ:'se',そ:'so',た:'ta',ち:'chi',つ:'tsu',て:'te',と:'to',
    な:'na',に:'ni',ぬ:'nu',ね:'ne',の:'no',は:'ha',ひ:'hi',ふ:'fu',へ:'he',ほ:'ho',
    ま:'ma',み:'mi',む:'mu',め:'me',も:'mo',や:'ya',ゆ:'yu',よ:'yo',
    ら:'ra',り:'ri',る:'ru',れ:'re',ろ:'ro',わ:'wa',を:'o',ん:'n',
    が:'ga',ぎ:'gi',ぐ:'gu',げ:'ge',ご:'go',ざ:'za',じ:'ji',ず:'zu',ぜ:'ze',ぞ:'zo',
    だ:'da',ぢ:'ji',づ:'zu',で:'de',ど:'do',ば:'ba',び:'bi',ぶ:'bu',べ:'be',ぼ:'bo',
    ぱ:'pa',ぴ:'pi',ぷ:'pu',ぺ:'pe',ぽ:'po',ゔ:'vu',ぁ:'a',ぃ:'i',ぅ:'u',ぇ:'e',ぉ:'o'
  };
  const DIGRAPHS={
    きゃ:'kya',きゅ:'kyu',きょ:'kyo',しゃ:'sha',しゅ:'shu',しょ:'sho',ちゃ:'cha',ちゅ:'chu',ちょ:'cho',
    にゃ:'nya',にゅ:'nyu',にょ:'nyo',ひゃ:'hya',ひゅ:'hyu',ひょ:'hyo',みゃ:'mya',みゅ:'myu',みょ:'myo',
    りゃ:'rya',りゅ:'ryu',りょ:'ryo',ぎゃ:'gya',ぎゅ:'gyu',ぎょ:'gyo',じゃ:'ja',じゅ:'ju',じょ:'jo',
    びゃ:'bya',びゅ:'byu',びょ:'byo',ぴゃ:'pya',ぴゅ:'pyu',ぴょ:'pyo',
    てぃ:'ti',でぃ:'di',ふぁ:'fa',ふぃ:'fi',ふぇ:'fe',ふぉ:'fo',しぇ:'she',ちぇ:'che',じぇ:'je'
  };
  const isKana=s=>/^[ぁ-ゖァ-ヺー]+$/u.test(s);
  const toHiragana=text=>[...text].map(c=>{
    const n=c.codePointAt(0);
    return n>=0x30a1&&n<=0x30f6?String.fromCodePoint(n-0x60):c;
  }).join('');
  function romaji(text){
    const s=toHiragana(text);
    if(s==='は')return 'wa';
    if(s==='へ')return 'e';
    let result='';
    for(let i=0;i<s.length;i++){
      const ch=s[i],next=s[i+1]||'';
      if(ch==='っ'){
        const following=DIGRAPHS[next+(s[i+2]||'')]||KANA[next]||'';
        result+=following.startsWith('ch')?'t':following[0]||'';
      }else if(ch==='ー'){
        const vowel=result.match(/[aeiou]$/);
        if(vowel)result+=vowel[0];
      }else if(ch==='ん'){
        result+='n';
        if(/^[あいうえおやゆよ]$/.test(next))result+="'";
      }else if(DIGRAPHS[ch+next]){
        result+=DIGRAPHS[ch+next];i++;
      }else result+=KANA[ch]||ch;
    }
    return result;
  }
  const safeRead=(key,fallback)=>{
    try{const parsed=JSON.parse(localStorage.getItem(key)||'null');return parsed===null?fallback:parsed}
    catch{return fallback}
  };
  const safeWrite=(key,value)=>{
    try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}
  };
  const safeRemove=key=>{try{localStorage.removeItem(key)}catch{}};
  const saved=safeRead(KEY,null);
  // Upgrade older, previously cached built-in lyrics without overwriting custom songs.
  const oldBuiltin=typeof saved==='string'&&
    saved.startsWith('(To you…yes my love to you yes my love to you you…to you) || ')&&
    saved.includes('stay with me…真夜中[まよなか]のドアをたたき')&&
    saved.includes('二人[ふたり]の瞬間[とき]を抱[だ]いてまだ忘[わす]れず　暖[あたた]めてた');
  if(oldBuiltin)safeRemove(KEY);
  const modes=safeRead(MODE,{});
  const savedDone=safeRead(PROGRESS,[]);
  const state={
    raw:typeof saved==='string'&&saved.trim()&&!oldBuiltin?saved:BUILTIN,
    lines:[],done:new Set(Array.isArray(savedDone)?savedDone:[]),
    hideJapanese:!!modes?.hideJapanese,hideReadings:!!modes?.hideReadings,
    hideNotes:!!modes?.hideNotes,speed:[.7,.85,1].includes(modes?.speed)?modes.speed:.85,
    sequenceId:0,playing:false
  };
  const newEl=(tag,cls,value)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(value!==undefined)node.textContent=value;
    return node;
  };
  function notice(msg){const el=$('toast');el.textContent=msg;el.hidden=false}
  // Each annotated span is parsed locally: 漢字[かんじ].
  const RUBY=/([\p{Script=Han}々ヶヵ]+)\[([ぁ-ゖァ-ヺー]+)\]/gu;
  function plainText(input){return input.replace(RUBY,(_match,word)=>word)}
  function segments(text){
    if(!text)return [];
    if(typeof Intl!=='undefined'&&typeof Intl.Segmenter==='function'){
      try{return [...new Intl.Segmenter('ja',{granularity:'word'}).segment(text)].map(x=>x.segment)}
      catch{/* fall back to code-point grouping */}
    }
    return text.match(/[ぁ-ゖァ-ヺー]+|[一-龯々ヶヵ]+|[A-Za-z0-9]+|\s+|[^\s]/gu)||[];
  }
  function toTokens(source){
    const result=[];
    let offset=0;
    for(const match of source.matchAll(RUBY)){
      if(match.index>offset)for(const word of segments(source.slice(offset,match.index))){
        result.push({word,reading:isKana(word)?word:'',roman:isKana(word)?romaji(word):''});
      }
      result.push({word:match[1],reading:match[2],roman:romaji(match[2])});
      offset=match.index+match[0].length;
    }
    if(offset<source.length)for(const word of segments(source.slice(offset))){
      result.push({word,reading:isKana(word)?word:'',roman:isKana(word)?romaji(word):''});
    }
    return result;
  }
  function parse(input){
    const normalized=input.replace(/\r\n?/g,'\n').trim();
    if(!normalized)return [];
    const results=[];
    let stanza=1,started=false;
    for(const rawLine of normalized.split('\n')){
      const full=rawLine.trim();
      if(!full){if(started){stanza++;started=false}continue}
      started=true;
      const separator=full.indexOf(' || ');
      const japanese=separator<0?full:full.slice(0,separator).trim();
      const note=separator<0?'':full.slice(separator+4).trim();
      const display=plainText(japanese).trim();
      if(!display)continue;
      const key=results.length+'|'+display;
      results.push({key,stanza,original:japanese,display,note,tokens:toTokens(japanese),number:results.length+1});
    }
    return results;
  }
  function voicePreference(){
    try{
      const data=JSON.parse(localStorage.getItem('kanabiyori_state_v2')||'{}');
      return typeof data.voiceId==='string'?data.voiceId:'google';
    }catch{return 'google'}
  }
  function persistModes(){
    safeWrite(MODE,{
      hideJapanese:state.hideJapanese,hideReadings:state.hideReadings,hideNotes:state.hideNotes,speed:state.speed
    });
  }
  function showModes(){
    $('songContent').classList.toggle('hide-japanese',state.hideJapanese);
    $('songContent').classList.toggle('hide-reading',state.hideReadings);
    $('songContent').classList.toggle('hide-notes',state.hideNotes);
    for(const [id,key,hidden,visible] of [
      ['hideJapanese','hideJapanese','顯示日文','隱藏日文'],
      ['hideReadings','hideReadings','顯示讀音','隱藏讀音'],
      ['hideNotes','hideNotes','顯示中文','隱藏中文']
    ]){
      $(id).textContent=state[key]?hidden:visible;
      $(id).setAttribute('aria-pressed',String(state[key]));
    }
    $('speedSelect').value=String(state.speed);
  }
  function renderProgress(){
    const total=state.lines.length;
    const done=state.lines.filter(line=>state.done.has(line.key)).length;
    const pct=total?Math.round(done/total*100):0;
    $('progressCount').textContent=done+' / '+total+' 行';
    $('progressFill').style.width=pct+'%';
    $('progressTrack').setAttribute('aria-valuenow',String(pct));
    $('lineCount').textContent=total+' 行 · '+new Set(state.lines.map(l=>l.stanza)).size+' 段';
  }
  function updatePlaying(index){
    for(const card of $('songContent').querySelectorAll('.lyric-card')){
      card.classList.toggle('playing',card.dataset.index===String(index));
    }
  }
  function stopAudio(){
    state.sequenceId++;
    state.playing=false;
    if(speech?.stop)speech.stop();
    $('playAll').disabled=!speech?.supported()||!state.lines.length;
    $('stopAll').disabled=true;
    updatePlaying(-1);
  }
  const lineLang=line=>/^stay with me$/i.test(line.display)?'en-US':'ja-JP';
  function playLine(line,index){
    stopAudio();
    updatePlaying(index);
    speech.speak(line.display,{preference:voicePreference(),rate:state.speed,lang:lineLang(line),
      onEnd:()=>updatePlaying(-1),
      onError:()=>{updatePlaying(-1);notice('語音播放失敗，可回首頁設定改用「基本發音」。')}
    });
  }
  function playToken(token){
    stopAudio();
    const word=token.word.trim();
    if(!word)return;
    speech.speak(word,{preference:voicePreference(),rate:state.speed*.93,lang:/^[A-Za-z]+$/.test(word)?'en-US':'ja-JP',
      onError:()=>notice('無法播放這個詞語，請確認裝置是否支援日文語音。')});
  }
  function playAll(){
    if(!state.lines.length||!speech?.supported())return;
    stopAudio();
    const token=++state.sequenceId;
    state.playing=true;
    $('playAll').disabled=true;
    $('stopAll').disabled=false;
    const next=index=>{
      if(token!==state.sequenceId)return;
      if(index>=state.lines.length){stopAudio();notice('整首跟讀完成');return}
      updatePlaying(index);
      const card=$('songContent').querySelector('[data-index="'+index+'"]');
      if(card)card.scrollIntoView?.({block:'center',behavior:'smooth'});
      const ok=speech.speak(state.lines[index].display,{
        rate:state.speed,preference:voicePreference(),lang:lineLang(state.lines[index]),
        onEnd:()=>next(index+1),
        onError:()=>{stopAudio();notice('朗讀中斷，可選「基本發音」再試。')}
      });
      if(!ok)stopAudio();
    };
    next(0);
  }
  function makeToken(token){
    const word=token.word;
    if(!word.trim()||/^[、。！？!?,.\-〜～…：:（）()「」『』]+$/u.test(word)){
      const punctuation=newEl('span','token-punctuation',word);
      return punctuation;
    }
    const btn=newEl('button','lyric-token');
    btn.type='button';
    btn.disabled=!speech?.supported();
    btn.title='聽這個詞語：'+word;
    btn.setAttribute('aria-label','朗讀詞語 '+word+(token.reading?'，讀音 '+token.reading:''));
    if(token.reading&&/[\p{Script=Han}々ヶヵ]/u.test(word)){
      const ruby=newEl('ruby');
      ruby.append(newEl('rb','',word),newEl('rt','',token.reading));
      btn.append(ruby);
    }else btn.append(newEl('span','token-word',word));
    btn.append(newEl('span','roman',token.roman||''));
    btn.addEventListener('click',()=>playToken(token));
    return btn;
  }
  function renderCards(){
    const host=$('songContent');
    host.replaceChildren();
    let previousStanza=0;
    state.lines.forEach((line,i)=>{
      if(previousStanza!==line.stanza){
        previousStanza=line.stanza;
        const h=newEl('div','verse-heading');
        h.append(newEl('h3','','PART '+String(line.stanza).padStart(2,'0')),
          newEl('span','','逐行日文練習'));
        host.append(h);
      }
      const completed=state.done.has(line.key);
      const card=newEl('article','lyric-card'+(completed?' completed':''));
      card.dataset.index=String(i);
      const head=newEl('div','lyric-head');
      const counter=newEl('span','line-number','第 '+String(line.number).padStart(2,'0')+' 行');
      const actions=newEl('div','line-actions');
      const done=newEl('button','done-button',completed?'✓ 已練熟':'○ 標記練熟');
      done.type='button';
      done.setAttribute('aria-pressed',String(completed));
      done.addEventListener('click',()=>{
        if(state.done.has(line.key))state.done.delete(line.key);
        else state.done.add(line.key);
        safeWrite(PROGRESS,[...state.done]);
        card.classList.toggle('completed',state.done.has(line.key));
        done.textContent=state.done.has(line.key)?'✓ 已練熟':'○ 標記練熟';
        done.setAttribute('aria-pressed',String(state.done.has(line.key)));
        renderProgress();
      });
      actions.append(done);head.append(counter,actions);
      const words=newEl('div','lyric-main');
      words.lang='ja';
      words.setAttribute('aria-label','第 '+line.number+' 行歌詞逐詞練習');
      line.tokens.forEach(t=>words.append(makeToken(t)));
      card.append(head,words);
      if(line.note)card.append(newEl('p','line-note',line.note));
      const footer=newEl('div','line-footer');
      const hasUnannotated=/[\p{Script=Han}々ヶヵ]/u.test(line.original.replace(RUBY,''));
      const hint=newEl('span','line-hint',hasUnannotated?'漢字若需讀音，可在編輯處加 [かな]':'點詞語聽音，再試著跟讀整行');
      const play=newEl('button','btn-line-play','♪　聽這一行');
      play.type='button';
      play.disabled=!speech?.supported();
      play.setAttribute('aria-label','播放第 '+line.number+' 行日文');
      play.addEventListener('click',()=>playLine(line,i));
      footer.append(hint,play);
      card.append(footer);
      host.append(card);
    });
  }
  function applyLyrics(){
    const source=$('lyricInput').value;
    if(source.length>MAX_TEXT){notice('歌詞過長，請縮短至 '+MAX_TEXT+' 字以內。');return}
    const entries=parse(source);
    if(entries.length>MAX_LINES){notice('目前最多支援 '+MAX_LINES+' 行，請調整分行。');return}
    if(!entries.length){notice('請先貼上至少一行日文歌詞。');return}
    stopAudio();
    state.raw=source;
    state.lines=entries;
    const keys=new Set(entries.map(line=>line.key));
    state.done=new Set([...state.done].filter(key=>keys.has(key)));
    const savedLyrics=safeWrite(KEY,source);
    safeWrite(PROGRESS,[...state.done]);
    renderCards();renderProgress();showModes();
    $('study').hidden=false;$('emptyPanel').hidden=true;
    $('clearBtn').hidden=source===BUILTIN;
    $('editor').open=false;
    $('playAll').disabled=!speech?.supported();
    notice(savedLyrics?'已建立 '+entries.length+' 行練習，保存在此瀏覽器。':'已建立練習；此瀏覽器無法保存資料。');
    $('study').scrollIntoView?.({block:'start',behavior:'smooth'});
  }
  function restoreBuiltin(){
    if(state.raw===BUILTIN)return;
    if(!window.confirm('確定還原網站提供的歌曲歌詞？你自行修改的歌詞及進度會被清除。'))return;
    stopAudio();
    safeRemove(KEY);safeRemove(PROGRESS);
    state.raw=BUILTIN;state.done.clear();
    state.lines=parse(BUILTIN);
    $('lyricInput').value=BUILTIN;
    renderCards();renderProgress();showModes();
    $('study').hidden=false;$('emptyPanel').hidden=true;
    $('editor').open=false;$('clearBtn').hidden=true;
    $('playAll').disabled=!speech?.supported();
    notice('已還原完整歌曲歌詞與假名、中文提示。');
  }
  $('applyBtn').addEventListener('click',applyLyrics);
  $('clearBtn').addEventListener('click',restoreBuiltin);
  $('importFile').addEventListener('change',async event=>{
    const file=event.target.files?.[0];
    if(!file)return;
    if(file.size>65536){notice('文字檔過大，請使用 64 KB 以下的 TXT。');return}
    try{
      const value=await file.text();
      if(value.length>MAX_TEXT){notice('歌詞過長，請使用 '+MAX_TEXT+' 字以下的文字檔。');return}
      $('lyricInput').value=value;
      notice('文字檔已載入，可檢查後按「建立整首練習」。');
    }catch{notice('讀取文字檔失敗，請改用複製貼上。')}
    event.target.value='';
  });
  for(const [id,key] of [['hideJapanese','hideJapanese'],['hideReadings','hideReadings'],['hideNotes','hideNotes']]){
    $(id).addEventListener('click',()=>{state[key]=!state[key];persistModes();showModes()});
  }
  $('speedSelect').addEventListener('change',event=>{
    const rate=Number(event.target.value);
    if([.7,.85,1].includes(rate))state.speed=rate;
    persistModes();
  });
  $('playAll').addEventListener('click',playAll);
  $('stopAll').addEventListener('click',stopAudio);
  window.addEventListener('pagehide',stopAudio);
  $('lyricInput').value=state.raw;
  showModes();
  if(state.raw&&state.raw.length<=MAX_TEXT){
    const loaded=parse(state.raw);
    if(loaded.length<=MAX_LINES&&loaded.length){
      state.lines=loaded;
      $('study').hidden=false;
      $('emptyPanel').hidden=true;
      $('clearBtn').hidden=state.raw===BUILTIN;
      $('editor').open=false;
      $('playAll').disabled=!speech?.supported();
      renderCards();renderProgress();
    }
  }
})();
