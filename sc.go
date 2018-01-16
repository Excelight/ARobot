package main

import (
	"flag"
	"fmt"
	"github.com/go-vgo/robotgo"
	"log"
	"path"
	"path/filepath"
	"runtime"
	"time"
)

var SAVE_PATH = "./screencap"

func main() {

	currentAbsPath, err := filepath.Abs("./")
	if err != nil {
		log.Fatal("get current abs path error")
	}
	savePath := path.Join(currentAbsPath, SAVE_PATH)

	x1 := flag.Int("x1", 0, "x1")
	y1 := flag.Int("y1", 0, "y1")
	x2 := flag.Int("x2", 0, "x2")
	y2 := flag.Int("y2", 0, "y2")

	flag.Parse()

	if *x2 <= *x1 {
		log.Fatal("must x2 > x1")
	}
	if *y2 <= *y1 {
		log.Fatal("must y2 > y1")
	}

	width := *x2 - *x1
	height := *y2 - *y1

	runtime.GOMAXPROCS(runtime.NumCPU())

	bitmap := robotgo.CaptureScreen(*x1, *y1, width, height)

	imgName := time.Now().Format("2006_01_02_15_04_05") + ".png"
	robotgo.SaveBitmap(bitmap, path.Join(savePath, imgName))

	fmt.Printf("save image to %s\n", path.Join(savePath, imgName))
}

