(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const api=(document.querySelector('meta[name="prosolver-api"]')?.content||'').replace(/\/$/,'');
  const notice=document.querySelector('meta[name="prosolver-notice-version"]')?.content||'';
  const enabled=/^https:\/\/[^/]+\.workers\.dev$/.test(api) && notice!=='2026-11-draft';
  const q=new URLSearchParams(location.search);
  const referralCode=/^[A-F0-9]{18}$/i.test(q.get('ref')||'')?q.get('ref').toUpperCase():'';
  const form=$('waitlistForm'),error=$('error'),record=$('record'),output=$('recordStatus'),playback=$('playback');
  if(!enabled){$('submit').disabled=true;$('submit').textContent='Registration opens soon';$('accessForm').querySelector('button').disabled=true;}
  let recorder,stream,audioBlob,audioURL,timer,ticker,started,requestKey=crypto.randomUUID(),sending=false;
  const fail=message=>{error.textContent=message;error.classList.remove('hidden');error.scrollIntoView({block:'nearest'});};
  const clear=()=>{error.textContent='';error.classList.add('hidden');};
  const stopStream=()=>{if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}clearTimeout(timer);clearInterval(ticker);};
  const discard=()=>{audioBlob=null;if(audioURL)URL.revokeObjectURL(audioURL);audioURL=null;playback.removeAttribute('src');playback.classList.add('hidden');$('deleteRecording').classList.add('hidden');output.textContent='Up to 2 minutes';$('recordText').textContent='Record a voice note';};
  $('deleteRecording').onclick=discard;
  record.onclick=async()=>{
    clear();
    if(recorder?.state==='recording'){recorder.stop();return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){fail('Voice recording is unavailable in this browser. Please type your problem.');return;}
    discard();
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mime){stopStream();fail('This browser cannot make a supported recording. Please type your problem.');return;}
      recorder=new MediaRecorder(stream,{mimeType:mime});
      const chunks=[];
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recorder.onstop=()=>{
        audioBlob=new Blob(chunks,{type:recorder.mimeType.split(';')[0]});
        audioURL=URL.createObjectURL(audioBlob);playback.src=audioURL;playback.classList.remove('hidden');
        $('deleteRecording').classList.remove('hidden');record.classList.remove('active');
        $('recordText').textContent='Record again';
        output.textContent='Recording ready ('+Math.round(audioBlob.size/1024)+' KB)';
        if(audioBlob.size>5*1024*1024)fail('Recording exceeds 5 MiB. Please record a shorter note.');
        stopStream();
      };
      recorder.start(1000);started=Date.now();
      record.classList.add('active');$('recordText').textContent='Stop recording';
      ticker=setInterval(()=>{output.textContent='Recording '+Math.floor((Date.now()-started)/1000)+' / 120 seconds';},1000);
      timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},120000);
    }catch{stopStream();fail('Microphone permission was unavailable. Please type your problem.');}
  };
  form.onsubmit=event=>{
    event.preventDefault();clear();
    if(sending)return;
    if(!enabled)return fail('Registration is not open yet. Please check back later.');
    if(recorder?.state==='recording')return fail('Stop your recording before submitting.');
    if(!$('problem').value.trim()&&!audioBlob)return fail('Type or record a problem.');
    if(!$('email').validity.valid)return fail('Enter a valid email address.');
    if(!/^\+[\d ()-]{7,32}$/.test($('phone').value.trim()))return fail('Enter an international phone number beginning with +.');
    if(!$('consent').checked)return fail('Accept the privacy and contact notice.');
    if(audioBlob?.size>5*1024*1024)return fail('Recording exceeds 5 MiB.');
    const data=new FormData();
    for(const id of ['problem','daily','email','phone'])data.append(id,$(id).value.trim());
    data.append('consent','yes');data.append('notice_version',notice);data.append('request_key',requestKey);
    data.append('ref',referralCode);data.append('website','');
    if(audioBlob)data.append('audio',audioBlob,'voice-note');
    const xhr=new XMLHttpRequest();xhr.open('POST',api+'/submit');xhr.responseType='json';
    sending=true;$('submit').disabled=true;$('submit').textContent='Submitting…';
    xhr.upload.onprogress=e=>{if(e.lengthComputable)$('submit').textContent='Uploading '+Math.round(e.loaded/e.total*100)+'%…';};
    xhr.onload=()=>{
      const response=xhr.response||{};
      if(xhr.status>=200&&xhr.status<300){requestKey=crypto.randomUUID();$('entry').classList.add('hidden');$('success').classList.remove('hidden');$('captureCard').scrollIntoView({behavior:'smooth',block:'center'});}
      else fail(response.error||'Submission could not be completed. Please try later.');
    };
    xhr.onerror=()=>fail('Network error. Please try again.');
    xhr.onloadend=()=>{sending=false;$('submit').disabled=false;$('submit').textContent='Submit my problem & join waitlist →';};
    xhr.send(data);
  };
  $('accessForm').onsubmit=async event=>{
    event.preventDefault();
    const status=$('accessStatus');
    if(!enabled){status.textContent='Registration is not open yet.';return;}
    status.textContent='Sending…';
    try{const data=new FormData();data.append('email',$('accessEmail').value.trim());const res=await fetch(api+'/access',{method:'POST',body:data});const body=await res.json();status.textContent=body.message||body.error||'Unable to send link.';}
    catch{status.textContent='Unable to send link. Please try later.';}
  };
  $('reset').onclick=()=>{location.href=location.pathname;};
  window.addEventListener('pagehide',stopStream);
})();
