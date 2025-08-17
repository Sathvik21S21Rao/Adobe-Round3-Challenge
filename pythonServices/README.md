# Adobe-Challenge_1a

## Running with Docker

1. **Build the Docker image:**
    ```sh
    docker build --platform linux/amd64 -t headingdetection:h1 .
    ```

2. **Run the Docker container:**
    ```sh
    docker run --rm -v $(pwd)/input:app/input -v $(pwd)/output:app/output --network none headingdetection:h1
    ```

> **Note:**  
> Ensure that `input` and `output` directories exist in your project root before running the container.