import os, sys

# دوبار fork + setsid — دیمون‌سازی کامل برای بقا در برابر پاک‌سازی گروه پردازش شل
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
        os.execvp('bun', ['bun', 'run', 'dev'])
    os._exit(0)
os.waitpid(pid, 0)
print('daemon launched')
