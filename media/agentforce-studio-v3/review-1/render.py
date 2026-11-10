#!/usr/bin/env python3
"""Reuse V2, add the recorded healing example, then explain editor extension.

python3 media/agentforce-studio-v3/render.py --audio
python3 media/agentforce-studio-v3/render.py --render
"""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import textwrap

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
MEDIA = OUT.parent
AUDIO = OUT / 'audio-neural'
EDIT = OUT / 'edit'
BASE = MEDIA / 'agentforce-studio-thread'
HEAL = MEDIA / 'agentforce-studio'
NAME = 'agentforce-studio-v3'
BASE_END = 86.35
HEAL_START, HEAL_END = 63.60, 93.65
W, H, FPS = 1440, 900, 30
INK, MUTED, BLUE, PURPLE, GREEN = '#172239', '#53627c', '#2563eb', '#7954d5', '#147a55'
FONTS = Path('/System/Library/Fonts/Supplemental')


def run(*args):
    subprocess.run([str(a) for a in args], check=True)


def duration(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)]))


def font(size, bold=False):
    return ImageFont.truetype(str(FONTS / ('Arial Bold.ttf' if bold else 'Arial.ttf')), size)


def audio():
    import edge_tts
    AUDIO.mkdir(exist_ok=True)
    rows = json.loads((OUT / 'narration.json').read_text())
    for row in rows:
        mp3 = AUDIO / (row['id'] + '.mp3')
        if not mp3.exists():
            asyncio.run(edge_tts.Communicate(row['line'], 'en-US-AvaMultilingualNeural', rate='-5%', proxy=os.environ.get('HTTPS_PROXY')).save(str(mp3)))
        wav = mp3.with_suffix('.wav')
        run('ffmpeg', '-y', '-v', 'error', '-i', mp3, '-af',
            'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.10,areverse',
            '-ar', 48000, '-ac', 1, wav)
        row['seconds'] = duration(wav)
        print(row['id'], row['seconds'], flush=True)
    (OUT / 'durations.json').write_text(json.dumps(rows, indent=2) + '\n')


def text(draw, xy, line, size, fill=INK, bold=False):
    draw.text(xy, line, font=font(size, bold), fill=fill)


def paragraph(draw, xy, line, size=28, width=54, fill=MUTED, bold=False):
    x, y = xy
    for s in textwrap.wrap(line, width=width):
        text(draw, (x, y), s, size, fill, bold)
        y += int(size * 1.4)
    return y


def canvas(kicker):
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H
        d.line((0, y, W, y), fill=tuple(int(a + (b-a)*t) for a,b in zip((247,249,253),(233,238,250))))
    for x in range(0,W,48):d.line((x,0,x,H),fill='#e7edf8')
    for y in range(0,H,48):d.line((0,y,W,y),fill='#e7edf8')
    d.rounded_rectangle((72, 55, 84, 83), radius=5, fill=BLUE)
    text(d, (102, 56), 'ZANA  /  AGENTFORCE STUDIO', 23, INK, True)
    text(d, (72, 132), kicker.upper(), 21, BLUE, True)
    d.line((72, 816, 1368, 816), fill='#cdd7e8', width=2)
    text(d, (72, 838), 'BUILD  /  TEST  /  IMPROVE', 18, MUTED, True)
    text(d, (1238, 838), 'V3', 18, BLUE, True)
    return im, d


def card(d, box, color='#ffffff', outline='#dce3f2'):
    x0,y0,x1,y1 = box
    d.rounded_rectangle((x0+2,y0+9,x1+2,y1+9),radius=24,fill='#dfe6f4')
    d.rounded_rectangle(box,radius=24,fill=color,outline=outline,width=2)


def step(d, x, y, n, title, body, active=False):
    card(d,(x,y,x+290,y+164), '#eef3ff' if active else '#ffffff', BLUE if active else '#dce3f2')
    d.ellipse((x+22,y+21,x+60,y+59), fill=BLUE if active else '#e6edfa')
    text(d,(x+35,y+27),str(n),22,'#ffffff' if active else BLUE,True)
    text(d,(x+22,y+76),title,28,INK,True)
    text(d,(x+22,y+119),body,19,MUTED)


def slide(which, phase=4):
    if which == 'healing-intro':
        im,d=canvas('A separate policy regression example')
        text(d,(72,207),'A failing test is a starting point.',57,INK,True)
        paragraph(d,(76,295),'Ask the agent to improve it. Test the change against the same scenarios.',30,76)
        for x,number,label,color in [(145,'2 / 3','BASELINE',MUTED),(850,'3 / 3','BEST TESTED',GREEN)]:
            card(d,(x,420,x+445,665))
            text(d,(x+40,450),label,22,color,True)
            text(d,(x+40,500),number,84,color,True)
        text(d,(646,510),'→',65,BLUE,True)
        text(d,(150,719),'Next: recorded Studio workflow with deterministic demo responses',22,MUTED)
    elif which == 'editor':
        im,d=canvas('The editor can evolve, too')
        text(d,(72,204),'Ask for the tool you need.',64,INK,True)
        paragraph(d,(76,300),'Your coding agent can extend the editor plugin as you work.',32,70)
        card(d,(124,426,1316,700))
        text(d,(174,468),'YOUR CODING AGENT',22,BLUE,True)
        text(d,(174,517),'Editor source  →  checks  →  rebuild  →  reload',39,INK,True)
        text(d,(174,604),'Local source-linked plugin',26,MUTED)
        text(d,(76,761),'EDITOR EXTENSION WORKFLOW',18,MUTED,True)
    elif which == 'request':
        im,d=canvas('Start with a request')
        text(d,(72,202),'“Add a tool to export',65,INK,True)
        text(d,(72,286),'this agent’s diagnostics.”',65,BLUE,True)
        card(d,(126,443,1314,685))
        text(d,(174,480),'EXAMPLE REQUEST',21,PURPLE,True)
        paragraph(d,(174,533),'Describe the result you want. The coding agent changes the editor plugin source.',31,62,INK)
        text(d,(76,761),'WORKFLOW ILLUSTRATION  ·  THE EXAMPLE TOOL IS NOT IMPLEMENTED IN THIS FILM',18,MUTED,True)
    elif which == 'reload':
        im,d=canvas('Apply the improvement in place')
        text(d,(72,202),'Update. Check. Rebuild. Reload.',57,INK,True)
        paragraph(d,(76,299),'A source-linked plugin can pick up the new capability without being reinstalled.',30,74)
        for n,(title,body) in enumerate([('Update','Edit the plugin source'),('Check','Verify the change'),('Rebuild','Compile the plugin'),('Reload','Load the new version')],1):
            step(d,78+(n-1)*322,453,n,title,body,n==phase)
        text(d,(82,705),'Reload applies the change. New tool definitions may need a fresh agent turn.',25,MUTED)
        text(d,(76,761),'EDITOR EXTENSION WORKFLOW',18,MUTED,True)
    elif which == 'repair':
        im,d=canvas('Repair the editor through the same loop')
        text(d,(72,202),'Found an editor issue? Ask it to fix it.',53,INK,True)
        paragraph(d,(76,296),'The coding agent repairs the plugin, verifies the change, then reloads it.',30,76)
        for n,(title,body) in enumerate([('Reproduce','Identify the issue'),('Repair','Fix the plugin source'),('Verify','Check the fix'),('Reload','Continue in the editor')],1):
            step(d,78+(n-1)*322,453,n,title,body,n==phase)
        text(d,(82,705),'An agent-assisted repair workflow for the editor itself.',27,MUTED)
        text(d,(76,761),'EDITOR REPAIR WORKFLOW',18,MUTED,True)
    else:
        im,d=canvas('Keep improving')
        text(d,(72,205),'No uninstall.',79,INK,True)
        text(d,(72,308),'No reinstall.',79,BLUE,True)
        card(d,(126,491,1314,701))
        text(d,(176,536),'Your agent improves.',39,INK,True)
        text(d,(176,600),'Your editor evolves.',39,PURPLE,True)
    out=EDIT/(which+f'-{phase}'+'.png'); im.save(out);return out


def encode_still(row):
    still=slide(row['id']); seconds=row['seconds']+.65
    out=EDIT/(row['id']+'.mp4')
    inputs=['-loop','1','-framerate',FPS,'-i',still]
    if row['id'] in ['reload','repair']:
        frames=[slide(row['id'],phase) for phase in range(1,5)]
        sequence=EDIT/(row['id']+'-frames.txt')
        sequence.write_text(''.join(f"file '{f}'\nduration {seconds/4:.6f}\n" for f in frames)+f"file '{frames[-1]}'\n")
        inputs=['-f','concat','-safe','0','-i',sequence]
    run('ffmpeg','-y','-v','error',*inputs,'-i',AUDIO/(row['id']+'.wav'),'-stream_loop','-1','-i',AUDIO/'music.wav',
        '-vf',f'fade=t=in:st=0:d=0.18:color=0xf4f7fc,fade=t=out:st={seconds-.18}:d=0.18:color=0xf4f7fc',
        '-filter_complex','[1:a]apad,volume=1[v];[2:a]volume=0.075[m];[v][m]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=7[a]',
        '-map','0:v:0','-map','[a]','-t',f'{seconds:.6f}','-r',FPS,
        '-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p',
        '-c:a','aac','-ar',48000,'-ac','2','-b:a','160k',out)
    return out


def cut(source,start,end,name):
    out=EDIT/name
    run('ffmpeg','-y','-v','error','-ss',start,'-i',source,'-t',end-start,'-map','0:v:0','-map','0:a:0',
        '-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-r',FPS,
        '-c:a','aac','-ar',48000,'-ac','2','-b:a','160k',out)
    return out


def stamp(t,sep='.'):
    ms=round(t*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}{sep}{ms%1000:03}'


def parse_vtt(path,start,end,offset):
    cues=[]
    def sec(s):
        h,m,t=s.split(':');return int(h)*3600+int(m)*60+float(t)
    for block in path.read_text().split('\n\n'):
        lines=block.strip().splitlines()
        if not lines or ' --> ' not in lines[0]:continue
        a,b=map(sec,lines[0].split(' --> '))
        if a>=start and b<=end:
            cues.append((offset+a-start,offset+b-start,' '.join(lines[1:])))
    return cues


def render():
    EDIT.mkdir(exist_ok=True)
    rows=json.loads((OUT/'durations.json').read_text())
    cues={'duration':12,'chords':[0,3.43,6.86,10.29],'energy':[[0,.3]],'pluckFrom':.35,'drums':[]}
    (AUDIO/'music-cues.json').write_text(json.dumps(cues))
    run('node',BASE/'music.cjs',AUDIO/'music-cues.json',AUDIO/'music.wav')
    scenes={row['id']:encode_still(row) for row in rows}
    base=cut(BASE/'agentforce-studio-thread.mp4',0,BASE_END,'v2-reused.mp4')
    healing=cut(HEAL/'agentforce-studio.mp4',HEAL_START,HEAL_END,'recorded-self-healing.mp4')
    ordered=[base,scenes['healing-intro'],healing]+[scenes[r['id']] for r in rows[1:]]
    (EDIT/'concat.txt').write_text(''.join(f"file '{p}'\n" for p in ordered))
    cues=parse_vtt(BASE/'agentforce-studio-thread.en.vtt',0,BASE_END,0)
    intro_at=duration(base)
    cues.append((intro_at+.10,intro_at+.10+rows[0]['seconds'],rows[0]['line']))
    heal_at=intro_at+duration(scenes['healing-intro'])
    cues+=parse_vtt(HEAL/'agentforce-studio.en.vtt',HEAL_START,HEAL_END,heal_at)
    editor_at=heal_at+duration(healing)
    at=editor_at
    chapters=[(0,'Build an agent — reused V2'),(heal_at,'Self-healing — recorded test workflow'),(editor_at,'Extend and repair the editor')]
    for row in rows[1:]:
        cues.append((at+.10,at+.10+row['seconds'],row['line']))
        if row['id']=='request':chapters.append((at,'Ask for a new editor tool'))
        if row['id']=='repair':chapters.append((at,'Repair the editor'))
        if row['id']=='finish':chapters.append((at,'Keep working without reinstalling'))
        at+=duration(scenes[row['id']])
    cues.sort()
    (OUT/(NAME+'.en.vtt')).write_text('WEBVTT\n\n'+'\n'.join(f'{stamp(a)} --> {stamp(b)}\n{textwrap.fill(line,80)}\n' for a,b,line in cues))
    (OUT/(NAME+'.en.srt')).write_text('\n'.join(f'{i}\n{stamp(a,",")} --> {stamp(b,",")}\n{textwrap.fill(line,80)}\n' for i,(a,b,line) in enumerate(cues,1)))
    (OUT/'transcript.md').write_text('# Agentforce Studio V3\n\n'+ '\n\n'.join(f'**{stamp(a)[:-4]}** {line}' for a,b,line in cues)+'\n')
    meta=';FFMETADATA1\ntitle=Agentforce Studio in Zana — V3\n'
    for i,(t,title) in enumerate(chapters):
        end=chapters[i+1][0] if i+1<len(chapters) else at
        meta+=f'\n[CHAPTER]\nTIMEBASE=1/1000\nSTART={round(t*1000)}\nEND={round(end*1000)}\ntitle={title}\n'
    (EDIT/'chapters.ffmeta').write_text(meta)
    run('ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',EDIT/'concat.txt','-i',OUT/(NAME+'.en.srt'),'-i',EDIT/'chapters.ffmeta',
        '-map','0:v:0','-map','0:a:0','-map','1:0','-map_metadata','2','-map_chapters','2',
        '-c:v','libx264','-preset','slow','-crf','20','-c:a','aac','-b:a','160k','-c:s','mov_text',
        '-metadata:s:s:0','language=eng','-movflags','+faststart',OUT/(NAME+'.mp4'))
    slide('finish').replace(OUT/'poster.png')
    run('ffmpeg','-y','-v','error','-i',OUT/'poster.png','-frames:v','1','-q:v','2',OUT/'poster.jpg')
    manifest={'duration':duration(OUT/(NAME+'.mp4')),'chapters':chapters,'cuts':[{'source':str(BASE/'agentforce-studio-thread.mp4'),'start':0,'end':BASE_END},{'source':str(HEAL/'agentforce-studio.mp4'),'start':HEAL_START,'end':HEAL_END}],
              'editorChapter':'Animated workflow explanation; example export tool is not implemented or shown as a live result.',
              'recordingProvenance':'Original V1/V2 built Electron footage; model and Salesforce responses are deterministic fixtures.',
              'sha256':hashlib.sha256((OUT/(NAME+'.mp4')).read_bytes()).hexdigest()}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest,indent=2),flush=True)


if __name__=='__main__':
    if sys.argv[1:]==['--audio']:audio()
    elif sys.argv[1:]==['--render']:render()
    else:raise SystemExit(__doc__)
