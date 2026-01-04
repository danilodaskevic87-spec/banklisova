// app.js

const sb = supabase.createClient(
  "https://mefzopeenhfdqfatbjaq.supabase.co",
  "sb_publishable_LU94dUJoW2jwZJ9WIdfsMw_lEnMQobx"
);

// ===== AUTH =====
async function register(){
  const { error } = await sb.auth.signUp({
    email: email.value,
    password: password.value
  });
  if(error) alert(error.message);
  else alert("OK");
}

async function login(){
  const { error } = await sb.auth.signInWithPassword({
    email: email.value,
    password: password.value
  });
  if(error) alert("❌");
  else location.href = "index.html";
}

async function logout(){
  await sb.auth.signOut();
  location.href = "index.html";
}

// ===== LOAD USER / BANK =====
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
    data = (await sb.from("bank")
      .select("*")
      .eq("user_id", user.id)
      .single()).data;
  }

  if(typeof balance !== "undefined") balance.innerText = data.balance;
  if(typeof myIdd !== "undefined") myIdd.innerText = data.idd;
  if(typeof uname !== "undefined") uname.innerText = data.name;

  if(typeof roleBadge !== "undefined"){
    roleBadge.innerHTML = "";
    if(data.is_admin) roleBadge.innerHTML = '<span class="badge admin">ADMIN</span>';
    else if(data.is_vip_user) roleBadge.innerHTML = '<span class="badge vip">VIP</span>';
  }
}

// ===== BUY (FOOD) =====
async function buy(cost){
  const { data:{user} } = await sb.auth.getUser();
  const { data } = await sb
    .from("bank")
    .select("balance")
    .eq("user_id", user.id)
    .single();

  if(data.balance < cost){
    alert("❌");
    return;
  }

  await sb
    .from("bank")
    .update({ balance: data.balance - cost })
    .eq("user_id", user.id);

  loadUser();
}

// ===== QR GENERATE =====
function makeQR(){
  qr.innerHTML = "";
  new QRCode(qr,{
    text: JSON.stringify({
      idd: Number(toIdd.value),
      sum: Number(sum.value)
    }),
    width: 200,
    height: 200
  });
}

// ===== QR SCAN + TRANSFER =====
async function scan(){
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
        const data = JSON.parse(code.data);

        const { data:{user} } = await sb.auth.getUser();
        const { data:me } = await sb
          .from("bank")
          .select("balance")
          .eq("user_id", user.id)
          .single();

        if(me.balance < data.sum){
          alert("❌");
          return;
        }

        const { data:to } = await sb
          .from("bank")
          .select("name")
          .eq("idd", data.idd)
          .single();

        if(confirm(`Ви дійсно хочете переказати ${data.sum} лісничяків користувачу ${to.name}?`)){
          await sb
            .from("bank")
            .update({ balance: me.balance - data.sum })
            .eq("user_id", user.id);

          await sb.rpc("add_balance_by_idd", {
            p_idd: data.idd,
            p_sum: data.sum
          });

          alert("✅");
        }
        return;
      }
    }
    requestAnimationFrame(loop);
  }
  loop();
}

loadUser();
