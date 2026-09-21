"""Read existing bot/channel configuration; never posts a test message."""
import json, subprocess
code = """
const chatId=process.env.TELEGRAM_SUCCESS_CHANNEL_ID?.trim();
if(!chatId || !process.env.TELEGRAM_BOT_TOKEN)throw Error('Success channel or bot is not configured');
const r=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/getChat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId}),signal:AbortSignal.timeout(15000)});
const result=await r.json();
if(!r.ok||!result.ok||result.result?.type!=='channel')throw Error('Success destination is not an accessible channel');
const me=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/getMe',{signal:AbortSignal.timeout(15000)}).then(r=>r.json());
if(!me.ok)throw Error('Bot identity check failed');
const member=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/getChatMember',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,user_id:me.result.id}),signal:AbortSignal.timeout(15000)}).then(r=>r.json());
const canPost=member.ok&&member.result?.status==='administrator'&&member.result?.can_post_messages===true;
if(!canPost)throw Error('Bot is not permitted to post to the success channel');
console.log(JSON.stringify({configured:true,type:result.result.type,title:result.result.title,username:result.result.username??null,can_post_messages:canPost,website_override_configured:Boolean(process.env.STOREFRONT_PUBLIC_URL)}));
"""
result=subprocess.run(['docker','exec','-i','telegram-store-app-1','node','--input-type=module'],input=code,text=True,capture_output=True)
if result.returncode: raise RuntimeError('Read-only success-channel check failed')
print(json.dumps(json.loads(result.stdout),ensure_ascii=True))
