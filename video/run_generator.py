# video/run_generator.py
# Script called by Node.js subprocess to generate video
import sys
import json
from video.generator import RealEstateVideoGenerator

if __name__ == "__main__":
    payload = json.loads(sys.argv[1])
    gen = RealEstateVideoGenerator(output_dir=payload.get("output_dir", "/tmp/videos"))
    output_path = gen.generate(
        photos=payload["photos"],
        template=payload.get("template", "slideshow_classico"),
        briefing=payload.get("briefing", {}),
        music_mood=payload.get("music_mood", "urbano"),
        job_id=payload["job_id"],
    )
    print(output_path, end="")
