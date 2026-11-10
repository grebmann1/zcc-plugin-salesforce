#!/usr/bin/env python3
"""Continuous V3: original app footage, self-healing and staged tool addition."""
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import wave
import hashlib

OUT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('v3_render', OUT / 'render.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
run, duration = m.run, m.duration
EDIT = OUT / 'edit'
REC = OUT / 'recording'
RATE = 48000


def main():
    rows=json.loads((OUT/'durations-inapp.json').read_text())
    timeline=json.loads((REC/'timeline.json').read_text())
    assert [r['id'] for r in rows]==[t['id'] for t in timeline]
    # Carry the editorial bridge in the voiceover while staying in the editor.
    bridge=next(r for r in json.loads((OUT/'durations.json').read_text()) if r['id']=='editor')
    rows[0]={**bridge,'id':'editor'}
    lead=1.2
    timeline=[{**t,'at':100 if i==0 else t['at']+round(lead*1000)} for i,t in enumerate(timeline)]
    raw=next(REC.glob('*.webm'))
    log=subprocess.run(['ffmpeg','-hide_banner','-i',str(raw),'-vf','blackdetect=d=0.2:pix_th=0.05','-an','-f','null','-'],capture_output=True,text=True,check=True).stderr
    flash=float(re.findall(r'black_end:([\d.]+)',log)[0])
    total=timeline[-1]['at']/1000+rows[-1]['seconds']+.8
    samples=bytearray(round(total*RATE)*2)
    for row,t in zip(rows,timeline):
        with wave.open(str(OUT/'audio-neural'/(row['id']+'.wav')),'rb') as w:
            assert w.getframerate()==RATE and w.getnchannels()==1
            data=w.readframes(w.getnframes())
        offset=round(t['at']/1000*RATE)*2
        samples[offset:offset+len(data)]=data
    voice=OUT/'audio-neural/inapp-assembled.wav'
    with wave.open(str(voice),'wb') as w:
        w.setparams((1,2,RATE,0,'NONE','not compressed'));w.writeframes(samples)
    scene=EDIT/'staged-inapp.mp4'
    run('ffmpeg','-y','-v','error','-ss',flash,'-i',raw,'-i',voice,'-stream_loop','-1','-i',OUT/'audio-neural/music.wav',
        '-filter_complex','[1:a]volume=1[v];[2:a]volume=0.075[m];[v][m]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=7[a]',
        '-vf',f'tpad=start_duration={lead}:start_mode=clone',
        '-map','0:v:0','-map','[a]','-t',total,'-r',30,'-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p',
        '-c:a','aac','-b:a','160k','-ar',RATE,'-ac','2',scene)
    # All additions use app footage. Even the earlier test introduction now
    # shows the real batch run instead of interrupting it with a title card.
    base=m.cut(m.BASE/'agentforce-studio-thread.mp4',0,m.BASE_END,'v2-reused.mp4')
    healing=m.cut(m.HEAL/'agentforce-studio.mp4',m.HEAL_START,m.HEAL_END,'recorded-self-healing.mp4')
    intro_row=next(r for r in json.loads((OUT/'durations.json').read_text()) if r['id']=='healing-intro')
    intro_length=intro_row['seconds']+.65
    intro=EDIT/'healing-intro-inapp.mp4'
    run('ffmpeg','-y','-v','error','-ss',m.HEAL_START-intro_length,'-i',m.HEAL/'agentforce-studio.mp4',
        '-i',OUT/'audio-neural/healing-intro.wav','-stream_loop','-1','-i',OUT/'audio-neural/music.wav',
        '-filter_complex','[1:a]apad,volume=1[v];[2:a]volume=0.075[m];[v][m]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=7[a]',
        '-map','0:v:0','-map','[a]','-t',intro_length,'-r',30,'-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p',
        '-c:a','aac','-b:a','160k','-ar',RATE,'-ac','2',intro)
    intro_at=duration(base)
    heal_at=intro_at+duration(intro)
    app_at=heal_at+duration(healing)
    end=app_at+duration(scene)
    cuts=[base,intro,healing,scene]
    concat=EDIT/'concat-inapp.txt';concat.write_text(''.join(f"file '{p}'\n" for p in cuts))
    cues=m.parse_vtt(m.BASE/'agentforce-studio-thread.en.vtt',0,m.BASE_END,0)
    cues.append((intro_at+.1,intro_at+.1+intro_row['seconds'],intro_row['line']))
    cues+=m.parse_vtt(m.HEAL/'agentforce-studio.en.vtt',m.HEAL_START,m.HEAL_END,heal_at)
    for row,t in zip(rows,timeline):
        at=app_at+t['at']/1000
        cues.append((at,at+row['seconds'],row['line']))
    chapters=[(0,'Build an agent — V2'),(intro_at,'Find the failing scenario'),(heal_at,'Self-healing in Studio'),(app_at,'Ask for a new editor tool'),
              (app_at+timeline[2]['at']/1000,'New tool ready — no reinstall'),(app_at+timeline[3]['at']/1000,'Use the new diagnostics export')]
    vtt=OUT/(m.NAME+'.en.vtt');srt=OUT/(m.NAME+'.en.srt')
    vtt.write_text('WEBVTT\n\n'+'\n'.join(f'{m.stamp(a)} --> {m.stamp(b)}\n{m.textwrap.fill(line,80)}\n' for a,b,line in cues))
    srt.write_text('\n'.join(f'{i}\n{m.stamp(a,",")} --> {m.stamp(b,",")}\n{m.textwrap.fill(line,80)}\n' for i,(a,b,line) in enumerate(cues,1)))
    meta=';FFMETADATA1\ntitle=Agentforce Studio in Zana — V3\n'
    for i,(at,title) in enumerate(chapters):
        stop=chapters[i+1][0] if i+1<len(chapters) else end
        meta+=f'\n[CHAPTER]\nTIMEBASE=1/1000\nSTART={round(at*1000)}\nEND={round(stop*1000)}\ntitle={title}\n'
    metadata=EDIT/'inapp.ffmeta';metadata.write_text(meta)
    result=OUT/(m.NAME+'.mp4')
    run('ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',concat,'-i',srt,'-i',metadata,
        '-map','0:v:0','-map','0:a:0','-map','1:0','-map_metadata','2','-map_chapters','2',
        '-c:v','libx264','-preset','slow','-crf','20','-c:a','aac','-b:a','160k','-c:s','mov_text',
        '-metadata:s:s:0','language=eng','-movflags','+faststart',result)
    run('ffmpeg','-y','-v','error','-ss',app_at+timeline[3]['at']/1000+2,'-i',result,'-frames:v','1','-q:v','2',OUT/'poster.jpg')
    (OUT/'transcript.md').write_text('# Agentforce Studio V3 — continuous app edit\n\n'+'\n\n'.join(f'**{m.stamp(a)[:-4]}** {line}' for a,b,line in cues)+'\n')
    manifest={'duration':duration(result),'chapters':chapters,'revision':'continuous-app-edit','inAppAt':app_at,
              'newSections':'Self-healing and editor extension remain inside the app. All added editorial slides removed; narration carries the transitions.',
              'sceneLeadSeconds':lead,'sceneNarration':[{**r,'at':t['at']/1000} for r,t in zip(rows,timeline)],
              'provenance':'Requested scripted scene: real app and Monaco; injected demo assistant, toolbar button, export dialog and downloadable sample JSON in an isolated profile. No installed product changes.',
              'sha256':hashlib.sha256(result.read_bytes()).hexdigest()}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest,indent=2))


if __name__=='__main__':main()
