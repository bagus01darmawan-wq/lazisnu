import pty
import os
import time

pid, fd = pty.fork()
if pid == 0:
    os.execvp("npx", ["npx", "drizzle-kit", "generate"])
else:
    time.sleep(3)
    os.write(fd, b"\r\n")
    try:
        while True:
            output = os.read(fd, 1024)
            if not output:
                break
            print(output.decode(errors='ignore'), end='')
    except OSError:
        pass
