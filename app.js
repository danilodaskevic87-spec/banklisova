const sb = supabase.createClient(
  "https://mefzopeenhfdqfatbjaq.supabase.co",
  "sb_publishable_LU94dUJoW2jwZJ9WIdfsMw_lEnMQobx"
);

let scannedIdd = null;

// ===== МІЙ QR (реальний idd) =====
async function myQR(){
  const qrBox = document.getElementById("qr");
  qrBox.innerHTML = "";

  const { data:{user} } = await sb.auth.getUser();
  if(!user){
    alert("❌ Ви не увійшли");
    return;
  }

  const { data, error } = await sb
    .from("bank")
    .select("idd")
    .eq("user_id", user.id)
    .single();

  if(error || !data){
    alert("❌ Bank не знайдено");
    return;
  }

  new QRCode(qrBox,{
    text: JSON.stringify({ idd: data.idd }),
    width:220,
    height:220
  });
}

// ===== SCAN QR =====
async function scan(){
  const cam = document.getElementById("cam");
  cam.hidden = false;

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter(d=>d.kind==="videoinput");
  if(cameras.length===0){
    alert("❌ Камеру не знайдено");
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video:{ deviceId:{ exact:cameras[cameras.length-1].deviceId } }
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

        const { data, error } = await sb
          .from("bank")
          .select("name")
          .eq("idd", scannedIdd)
          .single();

        if(error || !data){
          alert("❌ Отримувача не знайдено");
          return;
        }

        const r = document.getElementById("receiver");
        r.style.display="block";
        r.innerText = "Отримувач: " + data.name;
        return;
      }
    }
    requestAnimationFrame(loop);
  }
  loop();
}

// ===== PAY (REAL BALANCE TRANSFER) =====
async function pay(){
  if(!scannedIdd){
    alert("❌ Спочатку відскануйте QR");
    return;
  }

  const sum = Number(document.getElementById("sum").value);
  if(!sum || sum<=0){
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

  // списання
  await sb
    .from("bank")
    .update({ balance: me.balance - sum })
    .eq("user_id", user.id);

  // зарахування
  await sb.rpc("add_balance_by_idd", {
    p_idd: scannedIdd,
    p_sum: sum
  });

  alert("✅ Переказ виконано");
  location.reload();
}
