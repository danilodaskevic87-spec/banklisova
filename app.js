const sb = supabase.createClient(
  "https://mefzopeenhfdqfatbjaq.supabase.co",
  "sb_publishable_LU94dUJoW2jwZJ9WIdfsMw_lEnMQobx"
);

let scannedIdd = null;

// ===== МІЙ QR =====
async function myQR(){
  const { data:{user} } = await sb.auth.getUser();
  if(!user){ alert("Не увійшли"); return; }

  const { data } = await sb
    .from("bank")
    .select("idd")
    .eq("user_id", user.id)
    .single();

  const qrBox = document.getElementById("qr");
  qrBox.innerHTML = "";

  new QRCode(qrBox,{
    text: JSON.stringify({ idd: data.idd }),
    width:220,
    height:220
  });
}

// ===== SCAN =====
async function scan(){
  const cam = document.getElementById("cam");
  cam.hidden = false;

  const stream = await navigator.mediaDevices.getUserMedia({ video:true });
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
        const payload = JSON.parse(code.data);
        scannedIdd = payload.idd;

        const { data } = await sb
          .from("bank")
          .select("name")
          .eq("idd", scannedIdd)
          .single();

        document.getElementById("receiver").innerText =
          "Отримувач: " + data.name;

        return;
      }
    }
    requestAnimationFrame(loop);
  }
  loop();
}

// ===== PAY =====
async function pay(){
  if(!scannedIdd){
    alert("❌ Немає отримувача");
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
    p_idd: scannedIdd,
    p_sum: sum
  });

  alert("✅ Переказ виконано");
  location.reload();
}
