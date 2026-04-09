# video/generator.py
import os
import subprocess
import urllib.request
from typing import List, Optional, Dict

from video.templates import VIDEO_TEMPLATES, MUSIC_MOODS

# Fonts — Alpine Linux (apk add ttf-dejavu) or Railway NixOS
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# Fallback for NixOS on Railway
if not os.path.exists(FONT_BOLD):
    FONT_BOLD = "/run/current-system/sw/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    FONT_REG  = "/run/current-system/sw/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# 8 Ken Burns effects
EFFECTS = [
    "zoompan=z='min(zoom+0.0013,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={d}:s={w}x{h}:fps=30",
    "zoompan=z='if(lte(zoom,1.0),1.5,max(1.001,zoom-0.0013))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={d}:s={w}x{h}:fps=30",
    "zoompan=z='min(zoom+0.001,1.3)':x='iw-iw/zoom':y='0':d={d}:s={w}x{h}:fps=30",
    "zoompan=z='1.2':x='if(lte(on,1),(iw-iw/zoom)/2,x+0.5)':y='ih/2-(ih/zoom/2)':d={d}:s={w}x{h}:fps=30",
    "zoompan=z='min(zoom+0.0015,1.25)':x='0':y='ih-ih/zoom':d={d}:s={w}x{h}:fps=30",
    "zoompan=z='min(zoom+0.001,1.2)':x='iw/2-(iw/zoom/2)':y='0':d={d}:s={w}x{h}:fps=30",
    "zoompan=z='1.15':x='if(lte(on,1),iw-iw/zoom,x-0.4)':y='ih/2-(ih/zoom/2)':d={d}:s={w}x{h}:fps=30",
    "zoompan=z='min(zoom+0.0012,1.18)':x='iw/4':y='ih/4':d={d}:s={w}x{h}:fps=30",
]

TRANSITIONS = ["fade", "dissolve", "circleopen", "smoothleft",
               "fadeblack", "distance", "smoothright", "fadegrays"]


class RealEstateVideoGenerator:

    def __init__(self, output_dir: str = "/tmp/videos"):
        os.makedirs(output_dir, exist_ok=True)
        self.output_dir = output_dir

    def _escape(self, text: str) -> str:
        return text.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")

    def _download_photo(self, url: str, dest: str) -> str:
        urllib.request.urlretrieve(url, dest)
        return dest

    def _apply_ken_burns(self, photo_path: str, effect_idx: int,
                         clip_dur: int, fps: int, w: int, h: int,
                         job_id: str, idx: int) -> str:
        d = clip_dur * fps
        effect = EFFECTS[effect_idx % len(EFFECTS)].format(d=d, w=w, h=h)
        vf = f"scale=6000:-1,{effect},scale={w}:{h}:flags=lanczos"
        out = f"{self.output_dir}/kb_{job_id}_{idx}.mp4"
        cmd = [
            "ffmpeg", "-y", "-i", photo_path,
            "-vf", vf,
            "-t", str(clip_dur),
            "-r", str(fps),
            "-c:v", "libx264", "-preset", "fast",
            "-pix_fmt", "yuv420p", out
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        return out

    def _chain_xfade(self, clips: List[str], clip_dur: int,
                     trans_dur: float, fps: int, job_id: str) -> str:
        if len(clips) == 1:
            return clips[0]
        current = clips[0]
        for i in range(1, len(clips)):
            transition = TRANSITIONS[(i - 1) % len(TRANSITIONS)]
            offset = (clip_dur * i) - (trans_dur * i)
            out = f"{self.output_dir}/chain_{job_id}_{i}.mp4"
            cmd = [
                "ffmpeg", "-y", "-i", current, "-i", clips[i],
                "-filter_complex",
                f"[0:v][1:v]xfade=transition={transition}"
                f":duration={trans_dur}:offset={offset}[v]",
                "-map", "[v]", "-c:v", "libx264", "-preset", "fast",
                "-pix_fmt", "yuv420p", out
            ]
            subprocess.run(cmd, check=True, capture_output=True)
            if i > 1 and os.path.exists(current):
                os.unlink(current)
            current = out
        return current

    def _add_overlay_and_music(self, video_path: str, briefing: Dict,
                               music_path: Optional[str], total_dur: float,
                               w: int, h: int, job_id: str) -> str:
        street  = self._escape(briefing.get("street", ""))
        price   = self._escape(briefing.get("price", ""))
        details = self._escape(briefing.get("details", ""))

        vf_parts = []
        if street:
            vf_parts.append(
                f"drawtext=fontfile={FONT_BOLD}:text='{street}'"
                f":fontcolor=white:fontsize=36:x=(w-text_w)/2:y=320"
                f":box=1:boxcolor=black@0.55:boxborderw=12"
            )
        if price:
            vf_parts.append(
                f"drawtext=fontfile={FONT_BOLD}:text='{price}'"
                f":fontcolor=#F59E0B:fontsize=52:x=(w-text_w)/2:y=h-360"
                f":box=1:boxcolor=black@0.55:boxborderw=14"
            )
        if details:
            vf_parts.append(
                f"drawtext=fontfile={FONT_REG}:text='{details}'"
                f":fontcolor=#CBD5E1:fontsize=28:x=(w-text_w)/2:y=h-280"
                f":box=1:boxcolor=black@0.55:boxborderw=10"
            )

        vf = ",".join(vf_parts) if vf_parts else "null"
        out = f"{self.output_dir}/final_{job_id}.mp4"

        if music_path and os.path.exists(music_path):
            audio_filter = (
                f"[1:a]afade=t=in:st=0:d=2,"
                f"afade=t=out:st={max(0, total_dur-3)}:d=3,"
                f"volume=0.35[music]"
            )
            cmd = [
                "ffmpeg", "-y",
                "-i", video_path,
                "-stream_loop", "-1", "-i", music_path,
                "-filter_complex", audio_filter,
                "-vf", vf,
                "-map", "0:v", "-map", "[music]",
                "-c:v", "libx264", "-preset", "fast",
                "-c:a", "aac", "-b:a", "128k",
                "-t", str(total_dur),
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                out
            ]
        else:
            cmd = [
                "ffmpeg", "-y", "-i", video_path,
                "-vf", vf,
                "-c:v", "libx264", "-preset", "fast",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                out
            ]

        subprocess.run(cmd, check=True, capture_output=True)
        return out

    def generate(self, photos: List[str], template: str,
                 briefing: Dict, music_mood: str, job_id: str) -> str:
        tmpl  = VIDEO_TEMPLATES.get(template, VIDEO_TEMPLATES["slideshow_classico"])
        w, h  = tmpl["size"]
        fps   = tmpl["fps"]
        clip_dur  = tmpl["clip_duration"]
        trans_dur = tmpl["transition_duration"]

        photos = photos[:tmpl["max_photos"]]

        # 1. Download photos
        local_photos = []
        for i, url in enumerate(photos):
            dest = f"{self.output_dir}/photo_{job_id}_{i}.jpg"
            self._download_photo(url, dest)
            local_photos.append(dest)

        # 2. Ken Burns on each photo
        kb_clips = []
        for i, photo in enumerate(local_photos):
            clip = self._apply_ken_burns(photo, i, clip_dur, fps, w, h, job_id, i)
            kb_clips.append(clip)

        # 3. Chain with xfade
        chained = self._chain_xfade(kb_clips, clip_dur, trans_dur, fps, job_id)

        # 4. Overlay + music
        music_path = None
        music_file = MUSIC_MOODS.get(music_mood)
        if music_file and os.path.exists(music_file):
            music_path = music_file

        total_dur = (clip_dur * len(photos)) - (trans_dur * (len(photos) - 1))
        final = self._add_overlay_and_music(
            chained, briefing, music_path, total_dur, w, h, job_id
        )

        # 5. Cleanup temp files
        for f in local_photos + kb_clips:
            if os.path.exists(f) and f != chained:
                try:
                    os.unlink(f)
                except Exception:
                    pass
        if os.path.exists(chained) and chained != final:
            try:
                os.unlink(chained)
            except Exception:
                pass

        return final
