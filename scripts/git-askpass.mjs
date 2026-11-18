const prompt=process.argv[2]||'';
process.stdout.write(/username/i.test(prompt)?process.env.GDWS_VCS_USERNAME||'':process.env.GDWS_VCS_PASSWORD||'');
