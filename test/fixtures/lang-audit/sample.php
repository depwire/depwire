<?php

function process() {
    $local = 1;
    $helper = function () {
        return process();
    };
    return $helper();
}

class Worker {
    public function process() {
        $local = 2;
        return $local;
    }
}
