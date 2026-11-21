(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('waitlistForm'), button = $('record'), output = $('recordStatus'), playback = $('playback');
  const error = $('error');
  let recorder, stream, audioBlob, audioURL, stopTimer;
  const cfg = document.querySelector('meta[name="prosolver-api"]')?.content || '';
  const api = cfg.replace(/\/$/, '');
  const q = new URLSearchParams(location.search);
  const referralCode = (q.get('ref') || '').replace(/[^a-z0-9]/gi,'').slice(0,24).toUpperCase();
  function fail(message){ error.textContent=message; error.classList.remove('hidden'); }
  function clear(){error.textContent='';error.classList.add('hidden');}
  function resetMedia(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}clearTimeout(stopTimer);}
  function stop(){if(recorder?.state==='recording') recorder.stop();}
  button.addEventListener('click', async ()=>{
    clear();
    if(recorder?.state==='recording'){stop();return;}
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){fail('Voice notes are unsupported in this browser. Please type instead.');return;}
    try {
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'].find(t=>MediaRecorder.isTypeSupported(t));
      recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
      const chunks=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onstop=()=>{
        const type=recorder.mimeType.split(';')[0];
        audioBlob=new Blob(chunks,{type});
        if(audioURL) URL.revokeObjectURL(audioURL);
        audioURL=URL.createObjectURL(audioBlob);
        playback.src=audioURL;playback.classList.remove('hidden');
        button.classList.remove('active');$('recordText').textContent='Record again';
        output.textContent=`Recording ready (${Math.round(audioBlob.size/1024)} KB)`;
        if(audioBlob.size>5*1024*1024)fail('Recording exceeds 5 MB. Record a shorter note.');
        resetMedia();
      };
      recorder.start();
      button.classList.add('active');$('recordText').textContent='Stop recording'; output.textContent='Recording (maximum 2 minutes)';
      stopTimer=setTimeout(stop,120000);
    } catch {resetMedia();fail('Microphone permission unavailable. Type your problem instead.');}
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();clear();
    if(recorder?.state==='recording')return fail('Stop your recording before submitting.');
    if(!$('problem').value.trim()&&!audioBlob)return fail('Type or record a problem.');
    if(!$('email').validity.valid)return fail('Enter a valid email.');
    if(!$('consent').checked)return fail('Consent is required.');
    if(audioBlob?.size>5*1024*1024)return fail('Recording exceeds 5 MB.');
    if(!api||api.includes('REPLACE_'))return fail('Waitlist registration is not activated yet. Please check back soon.');
    const data=new FormData();
    for(const id of ['problem','daily','email','phone']) data.append(id,$(id).value.trim());
    data.append('consent','yes');data.append('ref',referralCode);data.append('website','');
    if(audioBlob)data.append('audio',audioBlob, 'hospital-voice-note.'+(audioBlob.type==='audio/mp4'?'mp4':'webm'));
    const submit=$('submit');submit.disabled=true;submit.textContent='Submitting securely…';
    try {
      const response=await fetch(api+'/submit',{method:'POST',body:data,mode:'cors'});
      const payload=await response.json();
      if(!response.ok)throw Error(payload.error||'Unable to submit.');
      $('entry').classList.add('hidden');$('success').classList.remove('hidden');
      $('success').querySelector('h2').textContent='Please check your email';
      $('success').querySelector('p').textContent='Open the verification link sent to your email. Your problem is pending verification. After verifying, your personal referral link will be shown.';
      $('success').querySelector('.referral-box').classList.add('hidden');
      $('share').classList.add('hidden');
      $('success').querySelector('.footnote').textContent='Referral points are issued only when referred professionals submit and verify a qualifying request.';
      $('captureCard').scrollIntoView({behavior:'smooth',block:'center'});
    } catch(e){fail(e.message||'The submission could not be completed.');}
    finally{submit.disabled=false;submit.textContent='Submit my problem & join waitlist →';}
  });
  if(q.get('verified')==='1' && /^[a-z0-9]{8,24}$/i.test(q.get('referral')||'')){
    $('entry').classList.add('hidden');$('success').classList.remove('hidden');
    $('success').querySelector('h2').textContent='Your email is verified';
    $('success').querySelector('p').textContent='You are on the ProSolver Hospitals waitlist. Share your referral link. You earn 1 point when a new eligible colleague submits a problem and verifies their email.';
    $('success').querySelector('.footnote').textContent='1 referral point can unlock 1 additional problem submission. Human resolution is not guaranteed and depends on availability.';
    $('referral').value=location.origin+location.pathname+'?ref='+encodeURIComponent(q.get('referral'));
    history.replaceState({},'',location.pathname);
  }
  $('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('referral').value);$('copy').textContent='Copied';}catch{$('referral').select();$('copy').textContent='Select link';}});
  $('share').addEventListener('click',async()=>{const url=$('referral').value;if(!url)return;try{if(navigator.share)await navigator.share({title:'ProSolver Hospitals',text:'Tell ProSolver about a hospital problem worth solving.',url});else await navigator.clipboard.writeText(url);}catch{}});
  $('reset').addEventListener('click',()=>{location.href=location.pathname;});
  window.addEventListener('pagehide',resetMedia);
})();
