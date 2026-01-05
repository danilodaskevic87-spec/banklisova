const sb = supabase.createClient(
  "https://mefzopeenhfdqfatbjaq.supabase.co",
  "sb_publishable_LU94dUJoW2jwZJ9WIdfsMw_lEnMQobx"
);

let scannedIdd = null;

// ===== ЗАВАНТАЖЕННЯ КАМЕР =====
async function loadCameras(){
  const select = document.getElementById("cameraSelect");
  if(!select) return;

  const devices = await navigator.mediaDevices.enumerateDevices();
  select.innerHTML = "";

  devices
    .filter(d => d.kind === "videoinput")
    .forEach((cam, i) => {
      const opt = document.createElement("option");
      opt.value = cam.deviceId;
      opt.text = cam.label || "Камера " + (i+1);
      select.appendChild(opt);
    });
}
loadCameras();

// ===== МІЙ QR =====
async function myQR(){
  const qrBox = document.getElementById("qr");
  qrBox.innerHTML = "";

  const { data:{user} } = await sb.auth.getUser();
  if(!user){ alert("❌ Ви не увійшли"); return; }

  const { data } = await sb
    .from("bank")
    .select("idd")
    .eq("user_id", user.id)
    .single();

  new QRCode(qrBox,{
    text: JSON.stringify({ idd: data.idd }),
    width:220,
    height:220
  });
}

// ===== SCAN QR =====
async function scan(){
  const cam = document.getElementById("cam");
  const select = document.getElementById("cameraSelect");

  cam.hidden = false;

  const stream = await navigator.mediaDevices.getUserMedia({
    video:{ deviceId:{ exact: select.value } }
  });

  cam.srcObject = stream;
  cam.play();

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  async function loop(){
    if(cam.readyState === cam.HAVE_ENOUGH_DATA){
      canvas.width = cam.videoWidth;
      canvas.height = cam.videoHeight;
      ctx.drawImage(cam,0,0);

      const img = ctx.getImageData(0,0,canvas.width,canvas.height);
      const code = jsQR(img.data, canvas.width, canvas.height);

      if(code){
        stream.getTracks().forEach(t=>t.stop());
        cam.hidden = true;

        const payload = JSON.parse(code.data);
        scannedIdd = payload.idd;

        showReceiver(scannedIdd);
        return;
      }
    }
    requestAnimationFrame(loop);
  }
  loop();
}

// ===== ПОКАЗ ОТРИМУВАЧА =====
async function showReceiver(idd){
  const { data } = await sb
    .from("bank")
    .select("name")
    .eq("idd", idd)
    .single();

  const r = document.getElementById("receiver");
  r.style.display="block";
  r.innerText = "Отримувач: " + data.name;
}

// ===== PAY =====
async function pay(){
  const manual = document.getElementById("manualIdd").value;
  const idd = manual ? Number(manual) : scannedIdd;

  if(!idd){
    alert("❌ Немає ID отримувача");
    return;
  }

  const sum = Number(document.getElementById("sum").value);
  if(!sum || sum <= 0){
    alert("❌ Введіть суму");
    return;
  }

  const { data:{user} } = await sb.auth.getUser();

  const { data:me } = await sb
    .from("bank")
    .select("balance")
    .eq("user_id", user.id)
    .single();

  if(me.balance < sum){
    alert("❌ Недостатньо коштів");
    return;
  }

  if(!confirm(`Переказати ${sum} лісничяків?`)) return;

  await sb
    .from("bank")
    .update({ balance: me.balance - sum })
    .eq("user_id", user.id);

  await sb.rpc("add_balance_by_idd", {
    p_idd: idd,
    p_sum: sum
  });

  alert("✅ Переказ виконано");
  location.reload();
}
