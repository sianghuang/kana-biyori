'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const GROUPS=window.AOT_GROUPS||[];
  const LINES=window.AOT_LINES||[];
  const FAVORITES_KEY='kana-biyori-aot-favorites-v1';
  const STUDY_KEY='kana-biyori-aot-study-v1';
  const VOICE_READY='speechSynthesis' in window&&typeof SpeechSynthesisUtterance!=='undefined';
  const clean=value=>String(value||'').replace(/[、。！？!?.,]/g,'').trim();
  const make=(tag,cls,value)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(value!==undefined)node.textContent=value;
    return node;
  };
  const readSaved=(key,fallback)=>{
    try{const raw=localStorage.getItem(key);return raw===null?fallback:JSON.parse(raw)}catch{return fallback}
  };
  const savedFavorites=readSaved(FAVORITES_KEY,[]);
  const savedStudy=readSaved(STUDY_KEY,{});
  const state={
    category:'all',query:'',spotlight:null,
    favorites:new Set(Array.isArray(savedFavorites)?savedFavorites.filter(x=>typeof x==='string'):[]),
    hideReadings:savedStudy&&savedStudy.hideReadings===true,
    hideMeaning:savedStudy&&savedStudy.hideMeaning===true
  };
  const groupFor=id=>GROUPS.find(group=>group.id===id);
  const save=()=>{
    try{
      localStorage.setItem(FAVORITES_KEY,JSON.stringify([...state.favorites]));
      localStorage.setItem(STUDY_KEY,JSON.stringify({hideReadings:state.hideReadings,hideMeaning:state.hideMeaning}));
    }catch{/* 線上無痕模式可以照常練習 */}
  };
  function notice(message){
    const target=$('toast');
    target.textContent=message;
    target.hidden=false;
  }

  // 與首頁相同：優先 Google 日語，排除可能無聲的 Kyoto/Kyoko。
  const unavailable=/(?:kyoto|kyoko|kyōko|kyouko|きょうこ|京都)/i;
  const female=/nanami|aoi|mayu|shiori|sakura|o-ren|mizuki|haruka|yuna|sayaka|hikari|yumi|女性|女声|女聲|female/i;
  let chosenVoice=null;
  function refreshVoice(){
    if(!VOICE_READY)return;
    const voices=window.speechSynthesis.getVoices().filter(voice=>
      /^ja(?:-|$)/i.test(voice.lang||'')&&!unavailable.test((voice.name||'')+' '+(voice.voiceURI||'')));
    const google=voices.filter(voice=>/google/i.test((voice.name||'')+' '+(voice.voiceURI||'')));
    const candidates=google.length?google:voices;
    chosenVoice=[...candidates].sort((a,b)=>
      Number(female.test(b.name||''))-Number(female.test(a.name||'')))[0]||null;
  }
  function say(japanese,rate=.82){
    if(!VOICE_READY){notice('瀏覽器不支援語音播放，請改用 Chrome、Safari 或 Edge。');return;}
    refreshVoice();
    if(!chosenVoice){notice('尚未載入可用的日文語音，請稍後重新試聽或檢查語音設定。');return;}
    try{
      const utterance=new SpeechSynthesisUtterance(clean(japanese));
      utterance.lang='ja-JP';
      utterance.rate=rate;
      utterance.voice=chosenVoice;
      utterance.onerror=event=>{
        if(!['canceled','interrupted'].includes(event.error))notice('無法播放日文，請檢查裝置的日文語音設定。');
      };
      $('toast').hidden=true;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }catch{notice('無法播放日文，請檢查裝置的日文語音設定。');}
  }
  function spokenWord(part){
    const written=clean(part[0]);
    if(written==='は'&&part[2]==='wa')return 'わ';
    if(written==='を'&&part[2]==='o')return 'お';
    if(written==='へ'&&part[2]==='e')return 'え';
    return written;
  }
  function phraseUnit(part){
    const [surface,reading,roman]=part;
    const button=make('button','phrase-unit');
    button.type='button';
    button.title='播放詞語：'+clean(surface);
    button.setAttribute('aria-label','播放詞語 '+clean(surface)+'，讀音 '+reading+'，羅馬拼音 '+roman);
    button.disabled=!VOICE_READY;
    const display=make('span','unit-jp');
    if(/[\u3400-\u9fff々]/.test(surface)){
      const ruby=make('ruby');
      ruby.append(make('rb','',surface),make('rt','',reading));
      display.append(ruby);
    }else display.textContent=surface;
    button.append(display,make('span','unit-roman',roman));
    button.addEventListener('click',()=>say(spokenWord(part),.76));
    return button;
  }
  function cardFor(item,spotlight=false){
    const article=make('article','quote-card');
    if(spotlight)article.classList.add('spotlight-card');
    const head=make('div','quote-head');
    const badge=make('span','quote-label','進擊的巨人 · '+(groupFor(item.group)?.title||'經典台詞'));
    const favorited=state.favorites.has(item.id);
    const favorite=make('button','favorite'+(favorited?' active':''),favorited?'★':'☆');
    favorite.type='button';
    favorite.setAttribute('aria-pressed',String(favorited));
    favorite.setAttribute('aria-label',favorited?'取消收藏台詞':'收藏台詞');
    favorite.addEventListener('click',()=>{
      if(state.favorites.has(item.id))state.favorites.delete(item.id);
      else state.favorites.add(item.id);
      save();render();
    });
    head.append(badge,favorite);
    article.append(head,make('h3','japanese',item.jp));
    const phrase=make('div','phrase-units');
    phrase.lang='ja';
    phrase.setAttribute('aria-label','分詞讀音練習');
    item.parts.forEach(part=>phrase.append(phraseUnit(part)));
    article.append(phrase,make('p','meaning',item.zh));
    const footer=make('div','quote-foot');
    footer.append(make('span','','ATTACK ON TITAN'),make('span','','點選上方詞語聽發音'));
    article.append(footer);
    const controls=make('div','quote-controls');
    const play=make('button','play-button','♪　整句播放');
    play.type='button';
    play.disabled=!VOICE_READY;
    play.setAttribute('aria-label','播放完整日文台詞：'+item.jp);
    play.addEventListener('click',()=>say(item.jp,.83));
    const copy=make('button','copy-button','複製日文');
    copy.type='button';
    copy.addEventListener('click',()=>{
      if(!navigator.clipboard?.writeText){notice('此瀏覽器無法自動複製，請長按台詞複製。');return;}
      navigator.clipboard.writeText(item.jp).then(()=>notice('已複製日文台詞')).catch(()=>notice('無法複製，請長按台詞。'));
    });
    controls.append(play,copy);
    article.append(controls);
    return article;
  }
  function matches(){
    return LINES.filter(item=>{
      if(state.category==='favorites'&&!state.favorites.has(item.id))return false;
      if(state.category!=='all'&&state.category!=='favorites'&&state.category!==item.group)return false;
      if(!state.query)return true;
      const g=groupFor(item.group);
      return [item.jp,item.zh,item.series,g?.title||'',
        item.parts.map(part=>part[1]).join(''),
        item.parts.map(part=>part[1]).join(' '),
        item.parts.map(part=>part[2]).join(' '),
        ...item.parts.flatMap(part=>[part[1],part[2]])]
        .some(field=>String(field).toLocaleLowerCase().includes(state.query));
    });
  }
  function renderNav(){
    const host=$('categoryNav');
    host.replaceChildren();
    const tabs=[{id:'all',title:'全部'},{id:'favorites',title:'☆ 收藏'},...GROUPS];
    tabs.forEach(tab=>{
      const button=make('button','category-chip'+(state.category===tab.id?' active':''),tab.title);
      button.type='button';
      button.setAttribute('aria-pressed',String(state.category===tab.id));
      button.addEventListener('click',()=>{
        state.category=tab.id;
        state.spotlight=null;
        render();
      });
      host.append(button);
    });
  }
  function renderToggles(){
    document.body.classList.toggle('hide-readings',state.hideReadings);
    document.body.classList.toggle('hide-meaning',state.hideMeaning);
    $('readingToggle').textContent=state.hideReadings?'顯示讀音':'隱藏讀音';
    $('readingToggle').setAttribute('aria-pressed',String(state.hideReadings));
    $('meaningToggle').textContent=state.hideMeaning?'顯示中文':'隱藏中文';
    $('meaningToggle').setAttribute('aria-pressed',String(state.hideMeaning));
  }
  function render(){
    renderNav();
    renderToggles();
    const found=matches();
    $('resultCount').textContent=found.length+' 句';
    const host=$('sections');
    host.replaceChildren();
    for(const group of GROUPS){
      const quotes=found.filter(line=>line.group===group.id);
      if(!quotes.length)continue;
      const section=make('section','section');
      const heading=make('div','section-heading');
      const summary=make('div');
      summary.append(make('h2','',group.title),make('p','',group.subtitle));
      heading.append(summary,make('span','section-count',quotes.length+' 句'));
      const grid=make('div','quote-grid');
      quotes.forEach(quote=>grid.append(cardFor(quote)));
      section.append(heading,grid);
      host.append(section);
    }
    if(!found.length){
      const empty=make('div','empty');
      empty.append(make('h2','','找不到符合的台詞'),make('p','','換個關鍵字，或試試其他主題。'));
      const reset=make('button','reset-button','顯示全部');
      reset.type='button';
      reset.addEventListener('click',()=>{
        state.category='all';state.query='';state.spotlight=null;
        $('searchInput').value='';render();
      });
      empty.append(reset);host.append(empty);
    }
    const feature=$('featured');
    feature.replaceChildren();
    const selected=found.find(item=>item.id===state.spotlight);
    feature.hidden=!selected;
    if(selected){
      const heading=make('div','featured-heading');
      heading.append(make('strong','','今天的一句 · '+(groupFor(selected.group)?.title||'動漫練習')),
        make('span','','✦'));
      feature.append(heading,cardFor(selected,true));
    }
  }
  $('searchInput').addEventListener('input',event=>{
    state.query=event.target.value.trim().toLocaleLowerCase();
    state.spotlight=null;
    render();
  });
  $('randomBtn').addEventListener('click',()=>{
    const pool=matches();
    if(!pool.length){notice('目前沒有符合條件的台詞。');return;}
    const line=pool[Math.floor(Math.random()*pool.length)];
    state.spotlight=line.id;
    render();
    $('featured').scrollIntoView?.({block:'start',behavior:'smooth'});
  });
  $('readingToggle').addEventListener('click',()=>{
    state.hideReadings=!state.hideReadings;save();renderToggles();
  });
  $('meaningToggle').addEventListener('click',()=>{
    state.hideMeaning=!state.hideMeaning;save();renderToggles();
  });
  if(VOICE_READY){
    refreshVoice();
    window.speechSynthesis.addEventListener?.('voiceschanged',refreshVoice);
  }
  $('totalLines').textContent=LINES.length+' 句日文台詞';
  render();
})();
