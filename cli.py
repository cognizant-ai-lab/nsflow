import typer
import subprocess
import os

app = typer.Typer()

def start_backend():
    """Starts the FastAPI and Neuro-SAN backend."""
    subprocess.run(["python", "-m", "nsflow.run"])

def start_frontend():
    """Starts the frontend React app."""
    os.chdir("frontend")
    subprocess.run(["yarn", "dev"])

@app.command()
def run():
    """Starts the full application (backend + frontend)."""
    typer.echo("Starting NSFlow Backend & Frontend...")
    
    backend_process = subprocess.Popen(["python", "-m", "nsflow.run"])
    frontend_process = subprocess.Popen(["yarn", "dev"], cwd="frontend")

    backend_process.wait()
    frontend_process.wait()

if __name__ == "__main__":
    app()
