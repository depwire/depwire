package com.example.a;

import com.example.b.ServiceB;

public class ServiceA {
    private ServiceB service;

    public ServiceA(ServiceB service) {
        this.service = service;
    }

    public String callService() {
        return service.getName();
    }
}
