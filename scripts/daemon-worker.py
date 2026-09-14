import os

# دیمون‌سازی Worker پردازش — الگوی دوبار fork مثل daemon-dev.py
pid = os.fork()
if pid == 0:
    os.setsid()
    try:
        pid2 = os.fork()
    except Exception:
        os._exit(1)
    if pid2 == 0:
        os.chdir('/home/z/my-project')
        devnull = os.open(os.devnull, os.O_RDWR)
        os.dup2(devnull, 0)
        os.dup2(devnull, 1)
        os.dup2(devnull, 2)
        os.execvp('bun', ['bun', '--max-old-space-size=1024', 'worker/worker.ts'])
    os._exit(0)
os.waitpid(pid, 0)
print('worker daemon launched')
