// ================= SUPABASE =================
const sb = supabase.createClient(
  "https://mefzopeenhfdqfatbjaq.supabase.co",
  "sb_publishable_LU94dUJoW2jwZJ9WIdfsMw_lEnMQobx"
);

// ================= LOAD USER =================
async function loadUser(){
  const { data:{user} } = await sb.auth.getUser();
  if(!user) return;

  let { data } = await sb
    .from("bank")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if(!data){
    await sb.from("bank").insert({
      user_id: user.id,
      balance: 0,
      name: "User"
    });
  }
}
loadUser();

// ================= QR GENERATE =================
async function makeQR(){
  const toIddEl = document.getElementById("toIdd");
  const sumEl   = document.getElementById("sum");
  const qrBox   = document.getElementById("qr");

  if(!toIddEl || !sumEl || !qrBox) return;

  const toIdd = Number(toIddEl.value);
  const sum   = Number(sumEl.value);

  if(!toIdd || !sum || sum <= 0){
    alert("❌ Введіть ID та суму");
    return;
  }

  const { data:{user} } = await sb.auth.getUser();
  if(!user){
    alert("❌ Ви не увійшли");
    return;
  }

  const { data:bank } = await sb
    .from("bank")
    .select("balance")
    .eq("user_id", user.id)
    .single();

  if(!bank || bank.balance < sum){
    alert("❌ Недостатньо коштів");
    return;
  }

  qrBox.innerHTML = "";
  new QRCode(qrBox,{
    text: JSON.stringify({ idd: toIdd, sum: sum }),
    width: 220,
    height: 220
  });
}

// ================= QR SCAN + TRANSFER =================
async function scan(){
  const cam = document.getElementById("cam");
  if(!cam) return;

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
        const { data:{user} } = await sb.auth.getUser();

        const { data:me } = await sb
          .from("bank")
          .select("balance")
          .eq("user_id", user.id)
          .single();

        if(!me || me.balance < payload.sum){
          alert("❌ Недостатньо коштів");
          return;
        }

        const { data:to } = await sb
          .from("bank")
          .select("name")
          .eq("idd", payload.idd)
          .single();

        if(!to){
          alert("❌ Отримувача не знайдено");
          return;
        }

        const ok = confirm(
          `Ви дійсно хочете переказати ${payload.sum} лісничяків користувачу ${to.name}?`
        );
        if(!ok) return;

        await sb
          .from("bank")
          .update({ balance: me.balance - payload.sum })
          .eq("user_id", user.id);

        await sb.rpc("add_balance_by_idd", {
          p_idd: payload.idd,
          p_sum: payload.sum
        });

        alert("✅ Переказ виконано");
        return;
      }
    }
    requestAnimationFrame(loop);
  }
  loop();
}

